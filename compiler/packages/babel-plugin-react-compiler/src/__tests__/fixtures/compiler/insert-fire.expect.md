
## Input

```javascript
import {fire} from 'react';

function Component({props, bar}) {
  const foo = () => {
    console.log(props);
  };
  useEffect(() => {
    fire(foo(props));
    fire(foo());
    fire(bar());
  });

  return null;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { fire } from "react";

function Component(t0) {
  const $ = _c(6);
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
      t2();
      t3();
    };
    $[2] = props;
    $[3] = t2;
    $[4] = t3;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  useEffect(t4);
  return null;
}

```
      
### Eval output
(kind: exception) Fixture not implemented