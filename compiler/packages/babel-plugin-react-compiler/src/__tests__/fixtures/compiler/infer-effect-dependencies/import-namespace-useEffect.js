// @inferEffectDependencies
import * as React from 'react';
import * as Shared from 'shared-runtime';

function NonReactiveDepInEffect() {
  const obj = makeObject_Primitives();
  React.useEffect(() => print(obj));
  Shared.useSpecialEffect(() => print(obj), [obj]);
}
