
## Input

```javascript
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
   6 |   };
   7 |   useEffect(() => {
>  8 |     fire(foo(props), bar);
     |     ^^^^^^^^^^^^^^^^^^^^^ InvalidReact: fire() only allows for a single call expression to be passed as an argument, got a spread argument or multiple arguments (8:8)

InvalidReact: fire() only allows for a single call expression to be passed as an argument, got a spread argument or multiple arguments (9:9)

InvalidReact: fire() only allows for a call expression to be passed as an argument (10:10)

InvalidReact: fire() only allows for a call expression to be passed as an argument (11:11)
   9 |     fire(...foo);
  10 |     fire(bar);
  11 |     fire(props.foo());
```
          
      