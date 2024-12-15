import {
  CompilerError,
  CompilerErrorDetailOptions,
  ErrorSeverity,
  SourceLocation,
} from '..';
import {
  CallExpression,
  Effect,
  Environment,
  FunctionExpression,
  GeneratedSource,
  HIR,
  HIRFunction,
  Identifier,
  IdentifierId,
  Instruction,
  InstructionId,
  InstructionKind,
  InstructionValue,
  isUseEffectHookType,
  LoadLocal,
  makeInstructionId,
  Place,
  promoteTemporary,
} from '../HIR';
import {createTemporaryPlace, markInstructionIds} from '../HIR/HIRBuilder';
import {getOrInsertWith} from '../Utils/utils';
import {BuiltInFireId, DefaultNonmutatingHook} from './ObjectShape';
import {printSourceLocationLine} from './PrintHIR';
import {eachInstructionOperand} from './visitors';

/*
 * TODO(jmbrown):
 *   - Simplify two FunctionExpression cases
 *   - rewrite dep arrays
 *   - traverse object methods
 */

function deleteInstructions(
  deleteInstrs: Set<InstructionId>,
  instructions: Array<Instruction>,
): Array<Instruction> {
  if (deleteInstrs.size > 0) {
    const newInstrs = instructions.filter(instr => !deleteInstrs.has(instr.id));
    return newInstrs;
  }
  return instructions;
}

function rewriteInstructions(
  rewriteInstrs: Map<InstructionId, Array<Instruction>>,
  instructions: Array<Instruction>,
): Array<Instruction> {
  if (rewriteInstrs.size > 0) {
    const newInstrs = [];
    for (const instr of instructions) {
      const newInstrsAtId = rewriteInstrs.get(instr.id);
      if (newInstrsAtId != null) {
        newInstrs.push(...newInstrsAtId, instr);
      } else {
        newInstrs.push(instr);
      }
    }

    return newInstrs;
  }

  return instructions;
}

function loadUseFire(env: Environment): {
  loadUseFireInstr: Instruction;
  useFirePlace: Place;
} {
  const useFirePlace = createTemporaryPlace(env, GeneratedSource);
  useFirePlace.effect = Effect.Read;
  useFirePlace.identifier.type = DefaultNonmutatingHook;
  const instrValue: InstructionValue = {
    kind: 'LoadGlobal',
    binding: {
      kind: 'Global',
      name: 'useFire',
    },
    loc: GeneratedSource,
  };
  return {
    loadUseFireInstr: {
      id: makeInstructionId(0),
      value: instrValue,
      lvalue: useFirePlace,
      loc: GeneratedSource,
    },
    useFirePlace,
  };
}

function loadFireCallee(
  env: Environment,
  fireCalleeIdentifier: Identifier,
): {loadFireCalleeInstr: Instruction; loadedFireCallee: Place} {
  const loadedFireCallee = createTemporaryPlace(env, GeneratedSource);
  const fireCallee: Place = {
    kind: 'Identifier',
    identifier: fireCalleeIdentifier,
    reactive: false,
    effect: Effect.Unknown,
    loc: fireCalleeIdentifier.loc,
  };
  return {
    loadFireCalleeInstr: {
      id: makeInstructionId(0),
      value: {
        kind: 'LoadLocal',
        loc: GeneratedSource,
        place: fireCallee,
      },
      lvalue: loadedFireCallee,
      loc: GeneratedSource,
    },
    loadedFireCallee,
  };
}

function callUseFire(
  env: Environment,
  useFirePlace: Place,
  argPlace: Place,
): {callUseFireInstr: Instruction; useFireCallResultPlace: Place} {
  const useFireCallResultPlace = createTemporaryPlace(env, GeneratedSource);
  useFireCallResultPlace.effect = Effect.Read;

  const useFireCall: CallExpression = {
    kind: 'CallExpression',
    callee: useFirePlace,
    args: [argPlace],
    loc: GeneratedSource,
  };

  return {
    callUseFireInstr: {
      id: makeInstructionId(0),
      value: useFireCall,
      lvalue: useFireCallResultPlace,
      loc: GeneratedSource,
    },
    useFireCallResultPlace,
  };
}

function storeUseFire(
  env: Environment,
  useFireCallResultPlace: Place,
  fireFunctionBindingPlace: Place,
): Instruction {
  promoteTemporary(fireFunctionBindingPlace.identifier);

  const fireFunctionBindingLValuePlace = createTemporaryPlace(
    env,
    GeneratedSource,
  );
  return {
    id: makeInstructionId(0),
    value: {
      kind: 'StoreLocal',
      lvalue: {
        kind: InstructionKind.Const,
        place: fireFunctionBindingPlace,
      },
      value: useFireCallResultPlace,
      type: null,
      loc: GeneratedSource,
    },
    lvalue: fireFunctionBindingLValuePlace,
    loc: GeneratedSource,
  };
}

type FireCalleesToFireFunctionBinding = Map<
  IdentifierId,
  {
    fireFunctionBinding: Place;
    capturedCalleeIdentifier: Identifier;
    fireLoc: SourceLocation;
  }
>;

class Context {
  #errors: CompilerError = new CompilerError();

  /*
   * Used to look up fire call expression passed to a `fire(callExpr())`. Gives back
   * the `callExpr()`.
   */
  #callExpressions = new Map<IdentifierId, CallExpression>();

  /*
   * We keep track of function expressions so that we can traverse them when
   * we encounter a lambda passed to a useEffect call
   */
  #functionExpressions = new Map<IdentifierId, FunctionExpression>();

  /*
   * Mapping from identifier ids to the most recent load local instruction
   * for that identifier
   */
  #loadLocals = new Map<IdentifierId, LoadLocal>();

  /*
   * Maps all of the fire callees found in a component/hook to the generated fire function places
   * we create for them. Makes sure we can reuse already-inserted useFire results
   */
  #fireCalleesToFireFunctions: Map<IdentifierId, Place> = new Map();

  /*
   * The callees for which we have already created fire bindings. Used to skip inserting a new
   * useFire call for a fire callee if one has already been created.
   */
  #calleesWithInsertedFire = new Set<IdentifierId>();

  /*
   * A mapping from fire callees to the fire function bindings that we have created for them
   * We additionally keep track of the captured callee identifier so that we can properly use it
   * in the place we create to load the fire callee to a useFire call
   */
  #capturedCalleeIdentifierIds: FireCalleesToFireFunctionBinding = new Map();

  #inUseEffectLambda = false;

  /*
   * Mapping from useEffect callee identifier ids to the instruction id of the
   * load global instruction for the useEffect call. We use this to insert the
   * useFire calls before the useEffect call
   */
  #loadGlobalInstructionIds = new Map<IdentifierId, InstructionId>();

  pushError(error: CompilerErrorDetailOptions): void {
    this.#errors.push(error);
  }

  withFunctionScope(fn: () => void): FireCalleesToFireFunctionBinding {
    /*
     * We have to save loadLocals because multiple LoadLocals can load the same IdentifierId and
     * we want to be sure we have access to the one loaded in the current function scope, not a prior
     * one.
     */

    const loadLocals = this.#loadLocals;
    this.#loadLocals = new Map();

    fn();

    this.#loadLocals = loadLocals;

    return this.#capturedCalleeIdentifierIds;
  }

  withUseEffectLambdaScope(fn: () => void): FireCalleesToFireFunctionBinding {
    const capturedCalleeIdentifierIds = this.#capturedCalleeIdentifierIds;
    const inUseEffectLambda = this.#inUseEffectLambda;

    this.#capturedCalleeIdentifierIds = new Map();
    this.#inUseEffectLambda = true;

    const resultCapturedCalleeIdentifierIds = this.withFunctionScope(fn);

    this.#capturedCalleeIdentifierIds = capturedCalleeIdentifierIds;
    this.#inUseEffectLambda = inUseEffectLambda;

    return resultCapturedCalleeIdentifierIds;
  }

  addCallExpression(id: IdentifierId, callExpr: CallExpression): void {
    this.#callExpressions.set(id, callExpr);
  }

  getCallExpression(id: IdentifierId): CallExpression | undefined {
    return this.#callExpressions.get(id);
  }

  addLoadLocalInstr(id: IdentifierId, loadLocal: LoadLocal): void {
    this.#loadLocals.set(id, loadLocal);
  }

  getLoadLocalInstr(id: IdentifierId): LoadLocal | undefined {
    return this.#loadLocals.get(id);
  }

  getOrGenerateFireFunctionBinding(
    callee: Place,
    env: Environment,
    fireLoc: SourceLocation,
  ): Place {
    const fireFunctionBinding = getOrInsertWith(
      this.#fireCalleesToFireFunctions,
      callee.identifier.id,
      () => createTemporaryPlace(env, GeneratedSource),
    );

    this.#capturedCalleeIdentifierIds.set(callee.identifier.id, {
      fireFunctionBinding,
      capturedCalleeIdentifier: callee.identifier,
      fireLoc,
    });

    return fireFunctionBinding;
  }

  mergeCalleesFromInnerScope(
    innerCallees: FireCalleesToFireFunctionBinding,
  ): void {
    for (const [id, calleeInfo] of innerCallees.entries()) {
      this.#capturedCalleeIdentifierIds.set(id, calleeInfo);
    }
  }

  addCalleeWithInsertedFire(id: IdentifierId): void {
    this.#calleesWithInsertedFire.add(id);
  }

  hasCalleeWithInsertedFire(id: IdentifierId): boolean {
    return this.#calleesWithInsertedFire.has(id);
  }

  inUseEffectLambda(): boolean {
    return this.#inUseEffectLambda;
  }

  addFunctionExpression(id: IdentifierId, fn: FunctionExpression): void {
    this.#functionExpressions.set(id, fn);
  }

  getFunctionExpression(id: IdentifierId): FunctionExpression | undefined {
    return this.#functionExpressions.get(id);
  }

  addLoadGlobalInstrId(id: IdentifierId, instrId: InstructionId): void {
    this.#loadGlobalInstructionIds.set(id, instrId);
  }

  getLoadGlobalInstrId(id: IdentifierId): InstructionId | undefined {
    return this.#loadGlobalInstructionIds.get(id);
  }

  hasErrors(): boolean {
    return this.#errors.hasErrors();
  }

  throwIfErrorsFound(): void {
    if (this.#errors.hasErrors()) throw this.#errors;
  }
}

function visitFunctionExpressionAndPropagateFireDependencies(fnExpr: FunctionExpression, context: Context, isUseEffect: boolean) {
  let withScope = isUseEffect ? context.withUseEffectLambdaScope.bind(context) : context.withFunctionScope.bind(context);
  /**
         * We're inside a function expression declared in a useEffect. We need to look
         * for any fire calls and replace them with generated fire function bindings.
         * Then we replace all references to the fire callees in the context and of
         * inner FunctionExpressions and update the LoadLocals for those FunctionExpressions
         * accordingly.
         */
  const calleesCapturedByFnExpression = withScope(() =>
    replaceFireFunctions(fnExpr.loweredFunc.func, context),
  );

  /*
   * Make a mapping from each dependency to the corresponding LoadLocal for it so that
   * we can replace the loaded place with the generated fire function binding
   */
  const loadLocalsToDepLoads = new Map<IdentifierId, LoadLocal>();
  for (const dep of fnExpr.loweredFunc.dependencies) {
    const loadLocal = context.getLoadLocalInstr(dep.identifier.id);
    if (loadLocal != null) {
      loadLocalsToDepLoads.set(loadLocal.place.identifier.id, loadLocal);
    }
  }

  const replacedCallees = new Map<IdentifierId, Place>();
  for (const [
    calleeIdentifierId,
    loadedFireFunctionBindingPlace,
  ] of calleesCapturedByFnExpression.entries()) {
    /*
     * Given the ids of captured fire callees, look at the deps for loads of those identifiers
     * and replace them with the loaded fire function binding
     */
    const loadLocal = loadLocalsToDepLoads.get(calleeIdentifierId);
    if (loadLocal == null) {
      context.pushError({
        loc: fnExpr.loc,
        description: null,
        severity: ErrorSeverity.Invariant,
        reason:
          '[InsertFire] No loadLocal found for fire call argument for lambda',
        suggestions: null,
      });
      continue;
    }

    const oldPlaceId = loadLocal.place.identifier.id;
    loadLocal.place = {
      ...loadedFireFunctionBindingPlace.fireFunctionBinding,
    };

    replacedCallees.set(
      oldPlaceId,
      loadedFireFunctionBindingPlace.fireFunctionBinding,
    );
  }

  for (
    let contextIdx = 0;
    contextIdx < fnExpr.loweredFunc.func.context.length;
    contextIdx++
  ) {
    const contextItem = fnExpr.loweredFunc.func.context[contextIdx];
    const replacedCallee = replacedCallees.get(contextItem.identifier.id);
    if (replacedCallee != null) {
      fnExpr.loweredFunc.func.context[contextIdx] = replacedCallee;
    }
  }

  context.mergeCalleesFromInnerScope(calleesCapturedByFnExpression);
  
  return calleesCapturedByFnExpression;
}

function replaceFireFunctions(fn: HIRFunction, context: Context): void {
  let hasRewrite = false;
  for (const [, block] of fn.body.blocks) {
    const rewriteInstrs = new Map<InstructionId, Array<Instruction>>();
    const deleteInstrs = new Set<InstructionId>();
    for (const instr of block.instructions) {
      const {value, lvalue} = instr;
      if (
        value.kind === 'CallExpression' &&
        isUseEffectHookType(value.callee.identifier) &&
        value.args[0].kind === 'Identifier'
      ) {
        const lambda = context.getFunctionExpression(
          value.args[0].identifier.id,
        );
        if (lambda != null) {
          const capturedCallees = visitFunctionExpressionAndPropagateFireDependencies(lambda, context, true);
          
          // Add useFire calls for all fire calls in found in the lambda
          const newInstrs = [];
          for (const [
            fireCalleePlace,
            fireCalleeInfo,
          ] of capturedCallees.entries()) {
            if (!context.hasCalleeWithInsertedFire(fireCalleePlace)) {
              context.addCalleeWithInsertedFire(fireCalleePlace);
              const {loadUseFireInstr, useFirePlace} = loadUseFire(fn.env);
              const {loadFireCalleeInstr, loadedFireCallee} = loadFireCallee(
                fn.env,
                fireCalleeInfo.capturedCalleeIdentifier,
              );
              const {callUseFireInstr, useFireCallResultPlace} = callUseFire(
                fn.env,
                useFirePlace,
                loadedFireCallee,
              );
              const storeUseFireInstr = storeUseFire(
                fn.env,
                useFireCallResultPlace,
                fireCalleeInfo.fireFunctionBinding,
              );
              newInstrs.push(
                loadUseFireInstr,
                loadFireCalleeInstr,
                callUseFireInstr,
                storeUseFireInstr,
              );
              const loadUseEffectInstrId = context.getLoadGlobalInstrId(
                value.callee.identifier.id,
              );
              if (loadUseEffectInstrId == null) {
                context.pushError({
                  loc: value.loc,
                  description: null,
                  severity: ErrorSeverity.Invariant,
                  reason: '[InsertFire] No loadGlobal found for useEffect call',
                  suggestions: null,
                });
                continue;
              }
              rewriteInstrs.set(loadUseEffectInstrId, newInstrs);
            }
          }
          ensureNoRemainingCalleeCaptures(
            lambda.loweredFunc.func,
            context,
            capturedCallees,
          );
        }
      } else if (
        value.kind === 'CallExpression' &&
        value.callee.identifier.type.kind === 'Function' &&
        value.callee.identifier.type.shapeId === BuiltInFireId &&
        context.inUseEffectLambda()
      ) {
        /*
         * We found a fire(callExpr()) call. We remove the `fire()` call and replace the callExpr()
         * with a freshly generated fire function binding. We'll insert the useFire call before the
         * useEffect call that this CallExpression is in.
         */

        /*
         * We only allow fire to be called with a CallExpression: `fire(f())`
         * TODO: add support for method calls: `fire(this.method())`
         */
        if (value.args.length === 1 && value.args[0].kind === 'Identifier') {
          const callExpr = context.getCallExpression(
            value.args[0].identifier.id,
          );

          if (callExpr != null) {
            const calleeId = callExpr.callee.identifier.id;
            const loadLocal = context.getLoadLocalInstr(calleeId);
            if (loadLocal == null) {
              context.pushError({
                loc: value.loc,
                description: null,
                severity: ErrorSeverity.Invariant,
                reason:
                  '[InsertFire] No loadLocal found for fire call argument',
                suggestions: null,
              });
              continue;
            }

            const fireFunctionBinding =
              context.getOrGenerateFireFunctionBinding(
                {...loadLocal.place},
                fn.env,
                value.loc,
              );

            loadLocal.place = {...fireFunctionBinding};

            // Delete the fire call expression
            deleteInstrs.add(instr.id);
          } else {
            context.pushError({
              loc: value.loc,
              description: null,
              severity: ErrorSeverity.InvalidReact,
              reason:
                'fire() only allows for a call expression to be passed as an argument',
              suggestions: null,
            });
          }
        } else {
          let reason: string =
            'fire() can only take in a single call expression as an argument';
          if (value.args.length === 0) {
            reason += ' but received none';
          } else if (value.args.length > 1) {
            reason += ' but received multiple arguments';
          } else if (value.args[0].kind === 'Spread') {
            reason += ' but received a spread argument';
          }
          context.pushError({
            loc: value.loc,
            description: null,
            severity: ErrorSeverity.InvalidReact,
            reason,
            suggestions: null,
          });
        }
      } else if (value.kind === 'CallExpression') {
        context.addCallExpression(lvalue.identifier.id, value);
      } else if (
        value.kind === 'FunctionExpression' &&
        context.inUseEffectLambda()
      ) {
        visitFunctionExpressionAndPropagateFireDependencies(value, context, false);
      } else if (value.kind === 'FunctionExpression') {
        context.addFunctionExpression(lvalue.identifier.id, value);
      } else if (value.kind === 'LoadLocal') {
        context.addLoadLocalInstr(lvalue.identifier.id, value);
      } else if (
        value.kind === 'LoadGlobal' &&
        value.binding.kind === 'ImportSpecifier' &&
        value.binding.module === 'react' &&
        value.binding.imported === 'fire' &&
        context.inUseEffectLambda()
      ) {
        deleteInstrs.add(instr.id);
      } else if (value.kind === 'LoadGlobal') {
        context.addLoadGlobalInstrId(lvalue.identifier.id, instr.id);
      }
    }
    block.instructions = rewriteInstructions(rewriteInstrs, block.instructions);
    block.instructions = deleteInstructions(deleteInstrs, block.instructions);

    if (rewriteInstrs.size > 0 || deleteInstrs.size > 0) {
      hasRewrite = true;
      fn.env.hasFireRewrite = true;
    }
  }

  if (hasRewrite) {
    markInstructionIds(fn.body);
  }
}

/*
 * eachInstructionOperand is not sufficient for our cases because:
 *  1. fire is a global, which will not appear
 *  2. The HIR may be malformed, so can't rely on function deps and must
 *     traverse the whole function.
 */
function* eachReachablePlace(fn: HIRFunction): Iterable<Place> {
  for (const [, block] of fn.body.blocks) {
    for (const instr of block.instructions) {
      if (
        instr.value.kind === 'FunctionExpression' ||
        instr.value.kind === 'ObjectMethod'
      ) {
        yield* eachReachablePlace(instr.value.loweredFunc.func);
      } else {
        yield* eachInstructionOperand(instr);
      }
    }
  }
}

function ensureNoRemainingCalleeCaptures(
  fn: HIRFunction,
  context: Context,
  capturedCallees: FireCalleesToFireFunctionBinding,
): void {
  for (const place of eachReachablePlace(fn)) {
    const calleeInfo = capturedCallees.get(place.identifier.id);
    if (calleeInfo != null) {
      const calleeName =
        calleeInfo.capturedCalleeIdentifier.name?.kind === 'named'
          ? calleeInfo.capturedCalleeIdentifier.name.value
          : '<unknown>';
      context.pushError({
        loc: place.loc,
        description: `All uses of ${calleeName} must be either used with a fire() call in \
this effect or not used with a fire() call at all. ${calleeName} was used with fire() on line \
${printSourceLocationLine(calleeInfo.fireLoc)} in this effect`,
        severity: ErrorSeverity.InvalidReact,
        reason: 'Ambiguous use of fire',
        suggestions: null,
      });
    }
  }
}

function ensureNoMoreFireUses(fn: HIRFunction, context: Context): void {
  for (const place of eachReachablePlace(fn)) {
    if (
      place.identifier.type.kind === 'Function' &&
      place.identifier.type.shapeId === BuiltInFireId
    ) {
      context.pushError({
        loc: place.identifier.loc,
        description: null,
        severity: ErrorSeverity.Invariant,
        reason: 'Cannot use `fire` outside of a useEffect function',
        suggestions: null,
      });
    }
  }
}

export function insertFire(fn: HIRFunction): void {
  const context = new Context();
  replaceFireFunctions(fn, context);
  if (!context.hasErrors()) {
    ensureNoMoreFireUses(fn, context);
  }
  context.throwIfErrorsFound();
}
