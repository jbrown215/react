
## Input

```javascript
// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = () => {
    console.log(props);
  };
  useEffect(() => {
    fire(props.foo());
  });

  return null;
}

```


## Error

```
   7 |   };
   8 |   useEffect(() => {
>  9 |     fire(props.foo());
     |     ^^^^^^^^^^^^^^^^^ InvalidReact: fire() only allows for a call expression to be passed as an argument (9:9)
  10 |   });
  11 |
  12 |   return null;
```
          
      