
## Input

```javascript
// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = props => {
    console.log(props);
  };
  useEffect(() => {
    function innerNested() {
      fire(foo(props));
      function nested() {
        fire(foo(props));
      }
    }

    nested();
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
  const $ = _c(1);
  const { props } = t0;
  const foo = _temp;
  const t1 = useFire(foo);
  let t2;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t2 = () => {
      nested();
    };
    $[0] = t2;
  } else {
    t2 = $[0];
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