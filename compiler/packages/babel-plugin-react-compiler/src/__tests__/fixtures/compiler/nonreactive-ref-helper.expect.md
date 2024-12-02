
## Input

```javascript
// @inferEffectDependencies
import {useEffect} from 'react';
import {makeObject_Primitives, print} from 'shared-runtime';

/**
 * Note that `obj` is currently added to the effect dependency array, even
 * though it's non-reactive due to memoization.
 *
 * This is a TODO in effect dependency inference. Note that we cannot simply
 * filter out non-reactive effect dependencies, as some non-reactive (by data
 * flow) values become reactive due to scope pruning. See the
 * `infer-effect-deps/pruned-nonreactive-obj` fixture for why this matters.
 *
 * Realizing that this `useEffect` should have an empty dependency array
 * requires effect dependency inference to be structured similarly to memo
 * dependency inference.
 * Pass 1: add all potential dependencies regardless of dataflow reactivity
 * Pass 2: (todo) prune non-reactive dependencies
 *
 * Note that instruction reordering should significantly reduce scope pruning
 */
function NonReactiveDepInEffect() {
  const ref = useRefHelper();
  const wrapped = useDeeperRefHelper();
  useEffect(() => {
    print(ref.current);
    print(wrapped.foo.current);
  });
}

function useRefHelper() {
  return useRef(0);
}

function useDeeperRefHelper() {
  return {foo: useRefHelper()};
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime"; // @inferEffectDependencies
import { useEffect } from "react";
import { makeObject_Primitives, print } from "shared-runtime";

/**
 * Note that `obj` is currently added to the effect dependency array, even
 * though it's non-reactive due to memoization.
 *
 * This is a TODO in effect dependency inference. Note that we cannot simply
 * filter out non-reactive effect dependencies, as some non-reactive (by data
 * flow) values become reactive due to scope pruning. See the
 * `infer-effect-deps/pruned-nonreactive-obj` fixture for why this matters.
 *
 * Realizing that this `useEffect` should have an empty dependency array
 * requires effect dependency inference to be structured similarly to memo
 * dependency inference.
 * Pass 1: add all potential dependencies regardless of dataflow reactivity
 * Pass 2: (todo) prune non-reactive dependencies
 *
 * Note that instruction reordering should significantly reduce scope pruning
 */
function NonReactiveDepInEffect() {
  const $ = _c(3);
  const ref = useRefHelper();
  const wrapped = useDeeperRefHelper();
  let t0;
  if ($[0] !== ref.current || $[1] !== wrapped.foo.current) {
    t0 = () => {
      print(ref.current);
      print(wrapped.foo.current);
    };
    $[0] = ref.current;
    $[1] = wrapped.foo.current;
    $[2] = t0;
  } else {
    t0 = $[2];
  }
  useEffect(t0, [ref, wrapped.foo]);
}

function useRefHelper() {
  return useRef(0);
}

function useDeeperRefHelper() {
  const $ = _c(2);
  const t0 = useRefHelper();
  let t1;
  if ($[0] !== t0) {
    t1 = { foo: t0 };
    $[0] = t0;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return t1;
}

```
      
### Eval output
(kind: exception) Fixture not implemented