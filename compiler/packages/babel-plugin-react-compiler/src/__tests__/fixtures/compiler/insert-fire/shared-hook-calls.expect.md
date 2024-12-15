
## Input

```javascript
// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = () => {
    console.log(props);
  };
  useEffect(() => {
    fire(foo(props));
    fire(bar(props));
  });

  useEffect(() => {
    fire(foo(props));
  });

  return null;
}

```

## Code

```javascript
import { useFire } from "react";
import { c as _c } from "react/compiler-runtime"; // @enableFire
import { fire } from "react";

function Component(t0) {
  const $ = _c(9);
  const { props, bar } = t0;
  let t1;
  if ($[0] !== props) {
    t1 = () => {
      console.log(props);
    };
    $[0] = props;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const foo = t1;
  const t2 = useFire(foo);
  const t3 = useFire(bar);
  let t4;
  if ($[2] !== props || $[3] !== t2 || $[4] !== t3) {
    t4 = () => {
      t2(props);
      t3(props);
    };
    $[2] = props;
    $[3] = t2;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  useEffect(t4);
  let t5;
  if ($[6] !== props || $[7] !== t2) {
    t5 = () => {
      t2(props);
    };
    $[6] = props;
    $[7] = t2;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  useEffect(t5);
  return null;
}

```
      
### Eval output
(kind: exception) Fixture not implemented