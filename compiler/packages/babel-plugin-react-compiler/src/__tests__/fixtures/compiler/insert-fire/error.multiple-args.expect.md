
## Input

```javascript
// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = () => {
    console.log(props);
  };
  useEffect(() => {
    fire(foo(props), bar);
  });

  return null;
}

```


## Error

```
   7 |   };
   8 |   useEffect(() => {
>  9 |     fire(foo(props), bar);
     |     ^^^^^^^^^^^^^^^^^^^^^ InvalidReact: fire() can only take in a single call expression as an argument but received multiple arguments (9:9)
  10 |   });
  11 |
  12 |   return null;
```
          
      