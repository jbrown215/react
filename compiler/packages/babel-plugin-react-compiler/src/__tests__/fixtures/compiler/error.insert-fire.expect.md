
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
    fire(...foo);
    fire(bar);
    fire(props.foo());
  });

  return null;
}

```


## Error

```
   7 |   };
   8 |   useEffect(() => {
>  9 |     fire(foo(props), bar);
     |     ^^^^^^^^^^^^^^^^^^^^^ InvalidReact: fire() only allows for a single call expression to be passed as an argument, got a spread argument or multiple arguments (9:9)

InvalidReact: fire() only allows for a single call expression to be passed as an argument, got a spread argument or multiple arguments (10:10)

InvalidReact: fire() only allows for a call expression to be passed as an argument (11:11)

InvalidReact: fire() only allows for a call expression to be passed as an argument (12:12)
  10 |     fire(...foo);
  11 |     fire(bar);
  12 |     fire(props.foo());
```
          
      