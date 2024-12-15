// @enableFire
import {fire} from 'react';

function Component({props, bar}) {
  const foo = props => {
    console.log(props);
  };
  useEffect(() => {
    function nested() {
      fire(foo(props));
      foo(props);
    }

    nested();
  });

  return null;
}
