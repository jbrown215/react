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
