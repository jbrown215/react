// @inferEffectDependencies
import {useEffect, useRef, AUTODEPS} from 'react';
import useEffectWrapper from 'useEffectWrapper';

const moduleNonReactive = 0;

function Component({foo}) {
  useEffectWrapper(
    () => {
      console.log(foo);
    },
    [foo],
    AUTODEPS
  );
}
