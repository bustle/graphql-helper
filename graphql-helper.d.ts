declare module 'graphql-helper' {
  interface graphQlMutation {
    toString: () => string
  }
  interface graphQlQuery {
    toString: () => string
  }
  interface graphQlFragment {
    toString: () => string
  }
  function fragment(OperationName: string, type: string): (...input: graphQlFragment[]) => graphQlFragment
  function query(OperationName: string, inputTypes?: any): (...input: graphQlFragment[]) => graphQlQuery
  function mutation(OperationName: string): (...input: graphQlFragment[]) => graphQlMutation
  function ignoreInvariants(): undefined
}
