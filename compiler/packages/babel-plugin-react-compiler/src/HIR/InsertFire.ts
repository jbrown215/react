import {
  BlockId,
  CallExpression,
  Effect,
  Environment,
  FunctionExpression,
  GeneratedSource,
  HIRFunction,
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
import {BuiltInFireId, DefaultNonmutatingHook} from './ObjectShape';

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
      const newInstr = rewriteInstrs.get(instr.id);
      if (newInstr != null) {
        newInstrs.push(...newInstr, instr);
      } else {
        newInstrs.push(instr);
      }
    }

    return newInstrs;
  }

  return instructions;
}

/**
 * Finds all fire call expressions reachable from some HIRFunction, including in nested scopes.
 * A fire call looks like `fire(callee(...args))`, which is:
 * 1. LoadLocal callee
 * N LoadLocal args ...
 * 2. CallExpr 1, [N LoadLocal args ...]
 * 3. LoadLocal Fire
 * 4. CallExpr 3, [2]
 *
 * We delete 3 and 4 and then add 1 to a set that we will replace with a generated result
 * of a useFire call in the inserFire function, resulting in:
 * 1. LoadLocal fireCallee (generated)
 * N LoadLocal args ...
 * 2. CallExpr 1, [N LoadLocal args ...]
 */
function findFireCalleeLoads(fn: HIRFunction, callees: Set<LoadLocal>): void {
  const callExpressions = new Map<IdentifierId, CallExpression>();
  const loadLocals = new Map<IdentifierId, LoadLocal>();
  for (const [, block] of fn.body.blocks) {
    const deleteInstrs = new Set<InstructionId>();
    for (const instr of block.instructions) {
      const {value, lvalue} = instr;
      if (value.kind === 'CallExpression') {
        if (
          value.callee.identifier.type.kind === 'Function' &&
          value.callee.identifier.type.shapeId === BuiltInFireId
        ) {
          /*
           * We only allow fire to be called with a CallExpression: `fire(f())`
           * TODO: add support for method calls: `fire(this.method())`
           */
          if (value.args.length === 1 && value.args[0].kind === 'Identifier') {
            const callExpr = callExpressions.get(value.args[0].identifier.id);

            if (callExpr != null) {
              const loadLocal = loadLocals.get(callExpr.callee.identifier.id);
              if (loadLocal == null) {
                // TODO: INVARIANT VIOLATION, NO LOCALLOAD FOR CALLEXPR CALLEE!
                continue;
              }
              callees.add(loadLocal);
              // Delete the fire call expression
              deleteInstrs.add(instr.id);
            } else {
              /*
               * INVARIANT VIOLATION OR SYNTAX ERROR?
               * There was no call expr passed to the fire call, which is invalid syntax
               */
            }
          } else {
            // REPORT AN ERROR! There was a spread arg passed to the fire call
          }
        } else {
          callExpressions.set(lvalue.identifier.id, value);
        }
      } else if (value.kind === 'FunctionExpression') {
        findFireCalleeLoads(value.loweredFunc.func, callees);
      } else if (value.kind === 'LoadLocal') {
        loadLocals.set(lvalue.identifier.id, value);
      } else if (
        value.kind === 'LoadGlobal' &&
        value.binding.kind === 'ImportSpecifier' &&
        value.binding.module === 'react' &&
        value.binding.imported === 'fire'
      ) {
        // Delete the fire load
        deleteInstrs.add(instr.id);
      }
    }

    block.instructions = deleteInstructions(deleteInstrs, block.instructions);
  }
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
): {fireFunctionBinding: Place; storeUseFireInstr: Instruction} {
  const fireFunctionBinding = createTemporaryPlace(env, GeneratedSource);
  promoteTemporary(fireFunctionBinding.identifier);

  const fireFunctionBindingLValuePlace = createTemporaryPlace(
    env,
    GeneratedSource,
  );
  return {
    storeUseFireInstr: {
      id: makeInstructionId(0),
      value: {
        kind: 'StoreLocal',
        lvalue: {
          kind: InstructionKind.Const,
          place: fireFunctionBinding,
        },
        value: useFireCallResultPlace,
        type: null,
        loc: GeneratedSource,
      },
      lvalue: fireFunctionBindingLValuePlace,
      loc: GeneratedSource,
    },
    fireFunctionBinding,
  };
}

function loadFireFunctionBinding(
  env: Environment,
  fireFunctionBinding: Place,
): {loadFireFunctionBindingInstr: Instruction; loadedFireFunctionPlace: Place} {
  const loadedFireFunctionPlace = createTemporaryPlace(env, GeneratedSource);
  return {
    loadFireFunctionBindingInstr: {
      id: makeInstructionId(0),
      value: {
        kind: 'LoadLocal',
        loc: GeneratedSource,
        place: fireFunctionBinding,
      },
      lvalue: loadedFireFunctionPlace,
      loc: GeneratedSource,
    },
    loadedFireFunctionPlace,
  };
}

/**
 * We need to insert 4 instructions here:
 * 1. load useFire
 * 2. call useFire with the already-loaded callee, which was loaded for the useEffect lambda
 * 3. store the result in a temporary, promote that temporary to get a const in source
 * 4. load the binding from 4 to prepare for the useEffect call
 *
 * We return the places required to populate the deps and context arrays of the useEffect function argument.
 */
function makeUseFireInstructions(
  env: Environment,
  loadFireCalleePlace: Place,
): {
  fireFunctionBinding: Place;
  loadedFireFunctionPlace: Place;
  instructions: Array<Instruction>;
} {
  const {loadUseFireInstr, useFirePlace} = loadUseFire(env);

  const {callUseFireInstr, useFireCallResultPlace} = callUseFire(
    env,
    useFirePlace,
    loadFireCalleePlace,
  );

  const {storeUseFireInstr, fireFunctionBinding} = storeUseFire(
    env,
    useFireCallResultPlace,
  );

  const {loadFireFunctionBindingInstr, loadedFireFunctionPlace} =
    loadFireFunctionBinding(env, fireFunctionBinding);

  const instructions: Array<Instruction> = [
    loadUseFireInstr,
    callUseFireInstr,
    storeUseFireInstr,
    loadFireFunctionBindingInstr,
  ];

  return {fireFunctionBinding, loadedFireFunctionPlace, instructions};
}

export function insertFire(fn: HIRFunction, env: Environment): void {
  const fnExpressions = new Map<
    IdentifierId,
    {blockId: BlockId; instrId: InstructionId; func: FunctionExpression}
  >();

  const loadLocalPlaces = new Map<
    IdentifierId,
    {instructionId: InstructionId; place: Place}
  >();
  for (const [, block] of fn.body.blocks) {
    for (const instr of block.instructions) {
      const rewriteInstrs = new Map<InstructionId, Array<Instruction>>();
      const {value, lvalue} = instr;
      if (value.kind === 'FunctionExpression') {
        fnExpressions.set(lvalue.identifier.id, {
          blockId: block.id,
          instrId: instr.id,
          func: value,
        });
      } else if (value.kind === 'LoadLocal') {
        loadLocalPlaces.set(value.place.identifier.id, {
          place: lvalue,
          instructionId: instr.id,
        });
      } else if (
        value.kind === 'CallExpression' &&
        isUseEffectHookType(value.callee.identifier) &&
        value.args[0].kind === 'Identifier'
      ) {
        const fnExpr = fnExpressions.get(value.args[0].identifier.id);
        if (fnExpr != null) {
          const fireCalleeLoads = new Set<LoadLocal>();
          findFireCalleeLoads(fnExpr.func.loweredFunc.func, fireCalleeLoads);
          if (fireCalleeLoads.size > 0) {
            const newInstrs: Array<Instruction> = [];
            const replacedLoadedCallees = new Map<IdentifierId, Place>();
            for (const loadFireCallee of fireCalleeLoads) {
              /**
               * Given a load of a captured callee, we need to generate a useFire call, assign
               * it to a local binding, and then replace that load with the generated fire.
               *
               * We repurpose the originally loaded callee that is captured by the lambda as
               * the load to call useFire, and then we add instructions to:
               * 1. Load useFire
               * 2. Call useFire with the originally-captured callee
               * 3. Store that result in a const
               * 4. Load the const to replace the original captured callee load
               *
               * Then we update the context/deps of the function to reflect the new captured value.
               */
              const loadOfOriginalCapturedCallee = loadLocalPlaces.get(
                loadFireCallee.place.identifier.id,
              );
              if (loadOfOriginalCapturedCallee == null) {
                // INVARIANT VIOLATION!
                console.log('INVARIANT VIOLATION');
                return;
              }

              const replacedCallee = replacedLoadedCallees.get(
                loadOfOriginalCapturedCallee.place.identifier.id,
              );

              if (replacedCallee != null) {
                /*
                 * If we've already created a useFire binding for this callee then
                 * replace the load for this callee with the already created binding
                 * instead of inserting another useFire call
                 */
                loadFireCallee.place = replacedCallee;
              } else {
                const {
                  fireFunctionBinding,
                  loadedFireFunctionPlace,
                  instructions,
                } = makeUseFireInstructions(
                  env,
                  loadOfOriginalCapturedCallee.place,
                );
                replacedLoadedCallees.set(
                  loadOfOriginalCapturedCallee.place.identifier.id,
                  fireFunctionBinding,
                );
                newInstrs.push(...instructions);

                /*
                 * Adjust the functions captured deps and context values. Notably, we would error
                 * if there are any direct calls to a function that is also fired, so we can replace
                 * these captured values in the arrays instead of pushing/filtering.
                 */
                const replaceContextValueIndex =
                  fnExpr.func.loweredFunc.func.context.findIndex(
                    place =>
                      place.identifier.id ===
                      loadFireCallee.place.identifier.id,
                  );
                const replaceDepValueIndex =
                  fnExpr.func.loweredFunc.dependencies.findIndex(
                    place =>
                      place.identifier.id ===
                      loadOfOriginalCapturedCallee.place.identifier.id,
                  );

                if (
                  replaceContextValueIndex < 0 ||
                  replaceContextValueIndex < 0
                ) {
                  // INVARIANT VIOLATION!
                  console.log('INVARIANT VIOLATION');
                  return;
                }

                fnExpr.func.loweredFunc.dependencies[replaceDepValueIndex] =
                  loadedFireFunctionPlace;
                fnExpr.func.loweredFunc.func.context[replaceContextValueIndex] =
                  fireFunctionBinding;

                // Rewrite the load to use the loaded fire function
                loadFireCallee.place = fireFunctionBinding;
              }
            }
            rewriteInstrs.set(fnExpr.instrId, newInstrs);
          }
        }
      }
      block.instructions = rewriteInstructions(
        rewriteInstrs,
        block.instructions,
      );
    }
  }

  markInstructionIds(fn.body);
}
