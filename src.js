/*
 * @flow
 *
 * graphql-helper
 *
 * a lightweight set of utilities for creating static GraphQL documents
 *
 */


// To ensure that we don't accidentally define a fragment or operation twice,
// we maintain a map of all our definitions:

type Definitions = {
  operations: StrMap<Operation<mixed, mixed>>,
  fragments: StrMap<Fragment>,
}

export const definitions: Definitions = {
  operations: {},
  fragments: {},
}


// FRAGMENT


// A fragment represents the data needs of some component.

// We want to express the following GraphQL fragment definition:

//   fragment FullPost on Post {
//     id
//     slug
//     title
//     body
//     contributors {
//       ...Contributor
//     }
//     author {
//       name
//       ...Author
//     }
//   }

// As some object which contains a flattened list of its dependencies:

export type Fragment = {
  __GRAPHQL_FRAGMENT__: true,
  name: string,
  on: string,
  definition: string,
  fragments: StrMap<Fragment>,
}

//   {
//     __GRAPHQL_FRAGMENT__: true,
//     name: "FullPost",
//     on: "Post",
//     definition: `fragment FullPost on Post {
//       id
//       slug
//       title
//       body
//       contributors {
//         ...Contributor
//       }
//       author {
//         name
//         ...Author
//       }
//     }`
//     fragments: {
//       Contributor,
//       Author,
//     }
//   }

// We construct it using a template string as follows:

//   const FullPost = GraphQL.fragment('FullPost', 'Post') `{
//     id
//     slug
//     title
//     body
//     contributors {
//       ${Contributor}
//     }
//     author {
//       name
//       ${Author}
//     }
//   }`

export function fragment(name: string, on: string = name): TemplateString<Fragment> {
  invariant(
    !definitions.fragments[name],
    `Fragment ${name} is already defined`
  )

  return (target, ...values) => definitions.fragments[name] = {
    __GRAPHQL_FRAGMENT__: true,
    name,
    on,
    definition: `fragment ${name} on ${on} ${String.raw(target, ...values)}`,
    fragments: mergeFragments(values),
    toString: () => `...${name}`,
  }
}


// mergeFragments takes an array of any value, and returns an accumulated map of all fragments
// flattening the dependency tree as it's called


function mergeFragments(values: Array<mixed>): StrMap<Fragment> {
  return values.reduce((acc, val) => {
    // value is a fragment
    if (val && val.__GRAPHQL_FRAGMENT__) {
      const fragment: Fragment = (val: any);
      acc[fragment.name] = fragment
      Object.assign(acc, fragment.fragments)
    }
    return acc
  }, {})
}


// OPERATION

// An operation desribes a query, mutation or subscription.
// These are instructions that take an optional input and return a result.

export type Operation<Vars,Res> =
  | Query<Vars,Res>
  | Mutation<Vars,Res>


// To form an operation definition, we need some representation of the input that it takes:

// query MyQuery ($id: ID!, $commentLimit: Int = 10, $previewLength: Int = 250) {
//                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//   post(id: $id) {
//     ...Post
//   }
// }
//
// fragment Post on Post {
//   id
//   title
//   comments(limit: $commentLimit) {
//     ...CommentPreview
//   }
// }
//
// fragment CommentPreview on Comment {
//   author {
//     id
//     name
//   }
//   summary(length: $previewLength)
// }


// We do so by creating a string map from variable names to the definition strings:

export type VariablesDef<Vars> = StrMap<string>

// e.g. { id: 'ID!', commentLimit: 'Int = 10', previewLength: 'Int = 250' }

// TODO: provide a validator function that checks if an input conforms to the definition

// there exists a natural way to transform this representation back to a GraphQL string

function printVariablesDef<U>(def: VariablesDef<U>) {
  const keys: Array<string> = Object.keys(def)
  return keys.length
    ? parenthesize(keys.map(k => `$${k}: ${def[k]}`).join(', '))
    : ""
}

function parenthesize(str: string): string {
  return `(${str})`
}


// QUERY

// We want to express the following query:

// query GetPost($id: ID!) {
//   post(id: $id) {
//     __typename
//     id
//     ...FullPost
//   }
// }

// as some object which contains all its dependencies, as well as a document containing just that query:

export type Query<Vars,Res> = {
  __GRAPHQL_QUERY__: true,
  name: string,
  variablesDef: VariablesDef<Vars>,
  definition: string,
  document: string,
  fragments: StrMap<Fragment>,
}

// {
//   __GRAPHQL_QUERY__: true,
//   name: string,
//   variablesDef: {
//     id: 'ID!'
//   },
//   // definition of just the operation
//   definition: `query GetPost($id: ID!) {
//     post(id: $id) {
//       __typename
//       id
//       ...FullPost
//     }
//   }`,
//   // free document containing only this query
//   document: `query GetPost($id: ID!) {
//     post(id: $id) {
//       __typename
//       id
//       ...FullPost
//     }
//   }
//
//   fragment FullPost on Post {
//     id
//     slug
//     title
//   ...etc
//   `,
//   // references to dependencies
//   fragments: {
//     FullPost,
//     Contributor,
//     Author,
//   },
// }


// we construct such an object with a template string as follows:

// const GetPost = GraphQL.query('GetPost', { id: 'ID!' }) `{
//   post(id: $id) {
//     __typename
//     id
//     ${Post}
//   }
// }`

export function query<Vars,Result>(
  name: string,
  variablesDef: VariablesDef<Vars> = {},
): TemplateString<Query<Vars,Result>> {

  invariant(
    !definitions.operations[name],
    `Operation ${name} is already defined`
  )

  return (target, ...values): Query<Vars,Result> => {

    const definition: string =
      `query ${name}${printVariablesDef(variablesDef)} ${String.raw(target, ...values)}`

    const fragments: StrMap<Fragment> =
      mergeFragments(values)

    const document: string =
      definition + "\n\n" + definitionsOf(fragments)

    return {
      __GRAPHQL_QUERY__: true,
      name,
      variablesDef,
      definition,
      document,
      fragments,
      // by default serialize to the free document
      toString: () => document,
      toJSON: () => document
    }
  }
}


// MUTATION

// Consider a relay-compliant GraphQL server with some mutation `createPost`:

//   type RootMutation {
//     ...
//     createPost(input: CreatePostInput): CreatePostPayload
//     ...
//   }
//
//   input CreatePostInput {
//     clientMutationId: String!
//     title: String!
//     body: String!
//   }
//
//   type CreatePostPayload {
//     clientMutationId: String!
//     post: Post!
//   }

// Then there exists a reasonable "Free Mutation" that performs a single mutation:

//   mutation CreatePost($input: CreatePostInput) {
//     payload: createPost(input: $Input) {
//       # application decides which fields to fetch
//       clientMutationId
//       post {
//         ...FullPost
//       }
//     }
//   }

// Our representation is nearly identical to that of a query:

export type Mutation<Vars,Res> = {
  __GRAPHQL_MUTATION__: true,
  name: string,
  variablesDef: VariablesDef<Vars>,
  definition: string,
  document: string,
  fragments: StrMap<Fragment>,
}


// But since all mutations share a syntactic form, we treat it as if the mutation looked just like:

//   # note that clientMutationId exists in all mutations
//   mutation createPost($title: String!, $body: String!) {
//     clientMutationId
//     post {
//       ...FullPost
//     }
//   }

// by formatting our template string as follows:

//   const CreatePost = GraphQL.mutation('createPost', {
//       title: 'String!',
//       body: 'String!',
//     }) `{
//       clientMutationId
//       post {
//         ${FullPost}
//       }
//     }`

export function mutation<Vars,Result>(
  name: string,
  variablesDef: VariablesDef<Vars> = {},
): TemplateString<Mutation<Vars,Result>> {
  invariant(
    !definitions.operations[name],
    `Operation ${name} is already defined`
  )
  const capitalized: string = capitalize(name)
  return (target, ...values) => {
    const definition: string =
`mutation ${capitalized}($input: ${capitalized}Input!) {
  payload: ${name}(input: $input) ${String.raw(target, ...values)}
}`

    const fragments: StrMap<Fragment> =
      mergeFragments(values)

    const document: string =
      definition + "\n\n" + definitionsOf(fragments)

    return {
      __GRAPHQL_MUTATION__: true,
      name,
      variablesDef,
      definition,
      document,
      fragments,
      // by default serialize to the free document
      toString: () => document,
      toJSON: () => document
    }

  }
}



// TODO: SUBSCRIPTION


// DOCUMENT

// A document represents a complete set of operations that we can perform,
// as well as the corresponding fragment definitions.
//
// Suppose that you wish to persist all queries upon building an app:

//   const Author = GraphQL.fragment('Author', 'User') `{
//     id
//     name
//   }`
//
//   const Post = GraphQL.fragment('Post', 'Post') `{
//     id
//     author {
//       ${Author}
//     }
//   }`
//
//   const GetPost = GraphQL.query('GetPost', { id: 'ID!' }) `{
//     post(id: $id) {
//       ${Post}
//     }
//   }`
//
//   const GetAuthor = GraphQL.query('GetAuthor', { id: 'ID!' }) `{
//     author: user(id: $id) {
//       ${Author}
//     }
//   }`
//
//   const CreatePost = GraphQL.mutation('createPost', { title: 'String!' }) `{
//     post {
//       ${Post}
//     }
//   }`


// It is reasonable to generate a complete document describing every operation the app can perform

//   query GetPost($id: ID!) {
//     post(id: $id) {
//       ...Post
//     }
//   }
//
//   query GetAuthor($id: ID!) {
//     author: user(id: $id) {
//       ...Author
//     }
//   }
//
//   mutation CreatePost($input: CreatePostInput!) {
//     payload: createPost(input: $input) {
//       post {
//         ...Post
//       }
//     }
//   }
//
//   fragment Author on User {
//     id
//     name
//   }
//
//   fragment Post on Post {
//     id
//     author {
//       ...Author
//     }
//   }

// We can then persist this document to the server, and give it some hash, say "3Xf0",
// and even pre-parse the AST for the document to shave off some of the response time.

// Rather than passing the entire document up with each request, we can now perform some request:

// curl -POST https://host.name/query/3Xf0 -d '{
//   "operationName": "GetPost",
//   "variables": "{ \"id\": \"d5-\" }"
// }'

// Thus, given some programmatic way to construct such a document:

export type Document = {
  document: string,
  operations: StrMap<Operation<mixed, mixed>>,
  fragments: StrMap<Fragment>,
}

//   const Document = GraphQL.document([ GetPost, GetAuthor, CreatePost ])

export function document(ops: Array<Operation<mixed, mixed>>): Document {
  const operations: StrMap<Operation<mixed, mixed>> =
    ops.reduce((acc, op) => {
      acc[op.name] = op
      return acc
    }, {})

  const fragments: StrMap<Fragment> =
    ops.reduce((acc, op) => {
      return Object.assign(acc, op.fragments)
    }, {})

  const document =
    definitionsOf(operations) + "\n\n" + definitionsOf(fragments)

  return { document, operations, fragments, toString: () => document, toJSON: () => document }
}

// We can, at build time, persist this document to the server

//   const queryHash = await persistDocument(Document)
//     // => "3Xf0"

// And rewrite our original code, stripping out all fragments, and leaving:

//   const GetPost = { queryHash: "3Xf0", type: "query", "name": "GetPost" }
//   const GetAuthor = { queryHash: "3Xf0", type: "query", "name": "GetAuthor" }
//   const CreatePost = { queryHash: "3Xf0", type: "mutation", "name": "CreatePost" }

// Sample implementation using webpack loaders (inspired by CSS modules) will come soon.


// For environments where import * is not supported, we also offer a default export
// It is not recommended to use this

export default { fragment, query, mutation, document }


// Helpers

type StrMap<V> = { [key: string]: V }

type TemplateString<V> = (target: any, ...values: Array<mixed>) => V


// We provide invariant checks for non-production builds to ensure that all queries are valid.
// The ignoreInvariants() function is used to disable the invariant checks for situations such as
// hot module reloading, where these can create spurious errors

let __IGNORE_INVARIANTS__ = false

function invariant(condition: mixed, message: string): void {
  if (!__IGNORE_INVARIANTS__ && !condition)
    throw new Error(`Invariant Exception: ${message}`)
}

export function ignoreInvariants(): void {
  __IGNORE_INVARIANTS__ = true
}


// capitalize the first character of a string
function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

// given some StrMap of objects with definitions, accumulate them into one document
function definitionsOf<A: { definition: string }>(map: StrMap<A>): string {
  return Object.keys(map)
    .map(key => map[key].definition)
    .join("\n\n")
}
