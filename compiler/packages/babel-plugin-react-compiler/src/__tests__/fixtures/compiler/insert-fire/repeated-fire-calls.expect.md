
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
  const $ = _c(5);
  const { props } = t0;
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
  let t3;
  if ($[2] !== props || $[3] !== t2) {
    t3 = () => {
      t2(props);
      t2(props);
    };
    $[2] = props;
    $[3] = t2;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  useEffect(t3);
  return null;
}

```
      
### Eval output
(kind: exception) Fixture not implemented