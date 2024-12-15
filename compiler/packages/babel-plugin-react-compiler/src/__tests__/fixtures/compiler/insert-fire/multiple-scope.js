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
