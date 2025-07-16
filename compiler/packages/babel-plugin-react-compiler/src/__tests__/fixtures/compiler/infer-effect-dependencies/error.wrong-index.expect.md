
## Input

```javascript
// @inferEffectDependencies
import {useEffect, useRef, AUTODEPS} from 'react';
import useEffectWrapper from 'useEffectWrapper';

const moduleNonReactive = 0;

function Component({foo}) {
  useEffectWrapper(
    () => {
      console.log(foo);
    },
    [foo],
    AUTODEPS
  );
}

```


## Error

```
   6 |
   7 | function Component({foo}) {
>  8 |   useEffectWrapper(
     |   ^^^^^^^^^^^^^^^^ InvalidReact: Invalid AUTODEPS. AUTODEPS was used at argument index 2 but should have been used at index 1 (8:8)
   9 |     () => {
  10 |       console.log(foo);
  11 |     },
```
          
      