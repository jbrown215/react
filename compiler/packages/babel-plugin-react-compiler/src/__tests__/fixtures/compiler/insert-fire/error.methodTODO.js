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
