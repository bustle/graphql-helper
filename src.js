/* @flow */

import fetch from 'isomorphic-fetch'

const noId = () => 'No ID Provided'
let gqlHost
  , gqlHeaders
  , gqlIgnoreInvariants
  , gqlClientMutationId

type TemplateStringTarget = any
type TemplateString<V> = (target: TemplateStringTarget, ...values: Array<mixed>) => V

type StrMap<V> = { [key: string]: V }

function decorate<T,K,V>(target: T, props: { [key: K]: V }): T {
  Object.keys(props).forEach(key => (target: any)[(key: any)] = props[(key: any)])
  return target
}

function invariant(condition: mixed, message: string): void {
  if (!gqlIgnoreInvariants && !condition) throw new Error(message)
}

declare class String {
  static raw: TemplateString<string>;
}

// TODO: schema validation

type Configs =
  { host: string                    // graphql endpoint
  , headers?: StrMap<string>        // additional request headers
  , ignoreInvariants: boolean       // ignore invariants (used for HMR)
  , clientMutationId?: () => string // ID generator
  }
export function configure(
  { host
  , headers = {}
  , ignoreInvariants = false
  , clientMutationId = noId
  }: Configs
): void {
  gqlHost = host
  gqlHeaders = { 'Content-Type': 'application/json', ...headers }
  gqlIgnoreInvariants = ignoreInvariants
  gqlClientMutationId = clientMutationId
}

// Request

// TODO: support operationName
export function request<U,V>(query: string, variables: ?U = null, operations: ?Array<string>): Promise<V> {
  return fetch
    ( gqlHost
    , { method: 'post'
      , headers: gqlHeaders
      , body: JSON.stringify(
          { query
          , variables: JSON.stringify(variables)
          , operations
          }
        )
      }
    )
    .then(r => r.json())
}

// Query

type VariablesDef<U> = StrMap<string>

type Query<U,V> = (variables: U) => Promise<V>

const operationDefinitions: StrMap<Query<mixed,mixed>> = {}

const wrapParens = (str: ?string): string => str ? `(${str})` : ''

export function query<U,V>(name: string, varsDef: ?VariablesDef<U>): TemplateString<Query<U,V>> {

  const params: string = wrapParens(
    runMaybe(varsDef, v =>
      Object.keys(v).map(k => `$${k}:${v[k]}`).join(',')
    )
  )

  return (target, ...values) => {

    invariant
      ( !operationDefinitions[name]
      , `ERROR: There is already an operation named ${name}`
      )

    const fragments: StrMap<FragmentDefinition> = mergeFragments(values)

    const operation = `query ${name} ${params} ${String.raw(target, ...values)}`
    const queryString = operation + ' ' +valuesOf(fragments).join(' ')

    return operationDefinitions[name] = decorate
      ( variables => request(queryString, variables)
          .then(r => r.errors ? Promise.reject(r.errors) : Promise.resolve(r.data))
      , { __GRAPHQL_QUERY__: true
        , operationName: name
        , operation
        , fragments
        , queryString
        , toString: () => queryString
        }
      )
  }

}

// Mutation

export function mutation<U,V>(name: string, varsDef: ?VariablesDef<U>): TemplateString<Query<U,V>> {

  const capitalized = capitalize(name)
  const inputType = `${capitalized}Input`
  const payloadType = `${capitalized}Payload`

  return (target, ...values) => {

    invariant
      ( !operationDefinitions[capitalized]
      , `ERROR: There is already an operation named ${capitalized}`
      )

    const fragments: StrMap<FragmentDefinition> = mergeFragments(values)

    const operation = `mutation ${capitalized}($input: ${inputType}!){
      payload: ${name}(input: $input) {
        clientMutationId
        ... on ${payloadType} ${String.raw(target, ...values)}
      }
    }`

    const queryString = operation + ' ' + valuesOf(fragments).join(' ')

    return operationDefinitions[capitalized] = decorate
      ( variables => request
         ( queryString
         , { input: { clientMutationId: gqlClientMutationId()
                    , ...variables
                    }
           }
         ).then(r => r.errors ? Promise.reject(r.errors) : Promise.resolve(r.data.payload))
      , { __GRAPHQL_MUTATION__: true
        , operationName: capitalized
        , operation
        , fragments
        , queryString
        , toString: () => queryString
        }
      )
  }

}

// Batch

export function batch(ops: Array<Query<mixed,mixed>>, variables: mixed): Promise<mixed> {

  // TEMPORARY: come up with a reasonable workaround for this:

  const names = ops.map(op => op.operationName)
  const fragments = mergeFragments(ops.map(op => op.fragments))
  const doc = ops.map(op => op.operation).join(' ')
            + ' '
            + valuesOf(fragments).join(' ')
  return request(doc, variables, names)
    .then(r => r.map(({ data, errors }, i) => {
      if (errors) throw new Error(errors)
      return data
    }))

}

// Partial

type Partial =
  { __GRAPHQL_QUERY_PARTIAL__: true
  , toString: () => string
  , fragments: StrMap<FragmentDefinition>
  }

type FragmentDefinition = string

export const partial: TemplateString<Partial> = (target, ...values) => (
  { __GRAPHQL_QUERY_PARTIAL__: true
  , toString: () => String.raw(target, ...values)
  , fragments: mergeFragments(values)
  }
)

// Fragment

type Fragment =
  { __GRAPHQL_QUERY_PARTIAL__: true
  , __GRAPHQL_FRAGMENT__: true
  , name: string
  , type: string
  , toString: () => string
  , fragments: StrMap<FragmentDefinition>
  }

const fragmentDefinitions: StrMap<Fragment> = {}

export const fragment = (name: string, type: string = name): TemplateString<Fragment> =>
  (target, ...values) => {

    invariant
      ( !fragmentDefinitions[name]
      , `ERROR: there is already a fragment with name ${name}`
      )

    return fragmentDefinitions[name] =
      { __GRAPHQL_QUERY_PARTIAL__: true
      , __GRAPHQL_FRAGMENT__: true
      , name
      , type
      , toString: () => `...${name}`
      , fragments:
        { ...mergeFragments(values)
        , [name]: `fragment ${name} on ${type} ${String.raw(target, ...values)}`
        }
      }

  }

// Union

export const union = (...partials: Array<Partial>): Partial => (
  { __GRAPHQL_QUERY_PARTIAL__: true
  , toString: () => '__typename ' + partials.map(p => p.toString()).join(' ')
  , fragments: mergeFragments((partials : any))
  }
)

// ember compat:

export default { configure, request, query, mutation, batch, partial, fragment, union }

// Query Partial Utils

const asPartial = (x: any): ?Partial =>
  (x && x.__GRAPHQL_QUERY_PARTIAL__) ? x : null

const mergeFragments = (values: Array<mixed>): StrMap<FragmentDefinition> =>
  ( values.map(asPartial).filter(x => !!x) : any )
    .reduce((acc, { fragments }) => Object.assign(acc, fragments), {})

// General Utils:


function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

function mapMaybe<A,B>(f: (val: A) => B): (val: ?A) => ?B {
  return x => x ? f(x) : null
}

function runMaybe<A,B>(x: ?A, f: (val: A) => B): ?B {
  return x ? f(x) : null
}

function valuesOf<K,V>(map: {[key: K]: V}): Array<V> {
  return Object.keys(map).map(k => map[(k: any)])
}
