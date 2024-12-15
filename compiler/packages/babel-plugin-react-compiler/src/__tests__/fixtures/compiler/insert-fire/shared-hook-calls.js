// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = () => {
    console.log(props);
  };
  useEffect(() => {
    fire(foo(props));
    fire(bar(props));
  });

  useEffect(() => {
    fire(foo(props));
  });

  return null;
}
