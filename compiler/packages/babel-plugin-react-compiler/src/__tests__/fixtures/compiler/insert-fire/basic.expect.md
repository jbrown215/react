
## Input

```javascript
// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = props => {
    console.log(props);
  };
  useEffect(() => {
    function eventFn() {
      fire(foo(props));
    }

    eventFn();
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
  const $ = _c(3);
  const { props } = t0;
  const foo = _temp;
  const t1 = useFire(foo);
  let t2;
  if ($[0] !== props || $[1] !== t1) {
    t2 = () => {
      const eventFn = function eventFn() {
        t1(props);
      };

      eventFn();
    };
    $[0] = props;
    $[1] = t1;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  useEffect(t2);
  return null;
}
function _temp(props_0) {
  console.log(props_0);
}

```
      
### Eval output
(kind: exception) Fixture not implemented