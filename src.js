/* @flow */

import fetch from 'isomorphic-fetch'

const noId = () => 'No ID Provided'
let gqlHost, gqlHeaders, gqlClientMutationId

type TemplateStringTarget = any
type TemplateString<V> = (target: TemplateStringTarget, ...values: Array<mixed>) => V

declare class String {
  static raw: TemplateString<string>;
}

// TODO: schema validation

type Configs =
  { host: string
  , headers?: { [key: string]: string }
  , clientMutationId?: () => string
  }
export function configure({ host, headers = {}, clientMutationId = noId }: Configs): void {
  gqlHost = host
  gqlHeaders = { 'Content-Type': 'application/json', ...headers }
  gqlClientMutationId = clientMutationId
}

// Request

// TODO: support operationName
export function request<U,V>(query: string, variables: ?U = null): Promise<V> {
  return fetch
    ( gqlHost
    , { method: 'post'
      , headers: gqlHeaders
      , body: JSON.stringify({ query, variables: JSON.stringify(variables) })
      }
    )
    .then(r => r.json())
    .then(r => r.errors ? Promise.reject(r.errors) : Promise.resolve(r.data))
}

// Query

type VariablesDef<U> = { [key: string]: string }

type Query<U,V> = (variables: U) => Promise<V>

export function query<U,V>(name: string, varsDef: ?VariablesDef<U>): TemplateString<Query<U,V>> {

  const paramsList: ?string = runMaybe(varsDef, v =>
    Object.keys(v).map(k => `$${k}:${v[k]}`).join(',')
  )

  const params: string = paramsList ? `(${paramsList})` : ''

  return (target, ...values) => {

    const fragmentDefinitions: string =
      collectFragments(values).join(' ')

    const query = `query ${name} ${params} ${String.raw(target, ...values)} ${fragmentDefinitions}`

    const fn = variables => request(query, variables)

    fn.queryString = query
    fn.toString = () => query

    return fn
  }

}

// Mutation

export function mutation<U,V>(name: string, varsDef: ?VariablesDef<U>): TemplateString<Query<U,V>> {

  const capitalized = capitalize(name)
  const inputType = `${capitalized}Input`
  const payloadType = `${capitalized}Payload`

  return (target, ...values) => {

    const fragmentDefinitions: string =
      collectFragments(values).join(' ')

    const query = `mutation ${capitalized}($input: ${inputType}!) {
      ${name}(input: $input) {
        clientMutationId
        ... on ${payloadType} ${String.raw(target, ...values)}
      }
    } ${fragmentDefinitions}`

    const fn = variables => request
      ( query
      , { input: { clientMutationId: gqlClientMutationId()
                 , ...variables
                 }
        }
      )

    fn.queryString = query
    fn.toString = () => query

    return fn

  }

}

// Partial

type Partial =
  { __GRAPHQL_QUERY_PARTIAL__: true
  , toString: () => string
  , fragments: { [key: string]: FragmentDefinition }
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
  , fragments: { [key: string]: FragmentDefinition }
  }

export const fragment = (name: string, type: string = name): TemplateString<Fragment> =>
  (target, ...values) => (
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
  )

// Union

export const union = (...partials: Array<Partial>): Partial => (
  { __GRAPHQL_QUERY_PARTIAL__: true
  , toString: () => '__typename ' + partials.map(p => p.toString()).join(' ')
  , fragments: mergeFragments((partials : any))
  }
)

// Query Partial Utils

const asPartial = (x: any): ?Partial =>
  (x && x.__GRAPHQL_QUERY_PARTIAL__) ? x : null

const mergeFragments = (values: Array<mixed>): { [key: string]: FragmentDefinition } =>
  ( values.map(asPartial).filter(x => !!x) : any )
    .reduce((acc, { fragments }) => Object.assign(acc, fragments), {})

const collectFragments = (values: Array<mixed>): Array<FragmentDefinition> =>
  valuesOf(mergeFragments(values))

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
