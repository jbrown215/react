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
