declare module '@babel/traverse' {
  import { NodePath, Visitor } from '@babel/traverse';

  function traverse(ast: any, visitors: Visitor): void;

  export default traverse;
}
