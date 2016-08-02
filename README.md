# graphql-helper

A GraphQL helper library intended for use on both the browser and server, using ES6 tagged template strings.
This library is meant for statically determined queries, and encourages the use of variables over string generation.

- **n.b.** This library comes with `isomorphic-fetch`, but does not come with a Promise polyfill.
- **TODO:** Support option for providing your own "fetch" method
- **TODO:** Support for static analysis and pre-compilation of queries

```bash
npm install --save graphql-helper
```

```js
import * as GraphQL from 'graphql-helper'

GraphQL.configure(
  { host: "http://localhost:3000/graphql"         // path to the GraphQL endpoint
  , headers: { Authorization: "my-token" }        // optional: additional headers in the request
  , clientMutationId: () => `ID:${Math.random()}` // optional: function for generating unique IDS
  }
)
```

# Query

```purs
GraphQL.query a b :: (name :: String, schema :: Schema a) -> QueryString b -> (a -> Promise b)
```

```js
const MyQuery = GraphQL.query('MyQuery', { siteKey: "String!" }) `{
  site(key: $siteKey) {
    id
    name
  }
}`

// usage

MyQuery({ siteKey: "bustle" })
  .then(console.log.bind(console))
// => { site: { id: 100, name: "bustle" } }
```

Translates to the following query:

```graphql
query MyQuery($siteKey: String!) {
  site(key: $siteKey) {
    id
    name
  }
}
```

Evaluated with the variables:

```json
{
  "siteKey": "bustle"
}
```

If no schema is provided, a query of no arguments is created (returning a thunk).

# Mutation

```purs
GraphQL.mutation a b :: (name :: String, schema :: Schema a) -> QueryString b -> (a -> Promise b)
```

Using mutations requires that your schema be set up as so:

```graphql
input MyMutationInput {
  clientMutationid: String!
  # ... any other fields here
}
type MyMutationOutput {
  clientMutationId: String!
  # ... any other fields here
}
type RootMutationType {
  myMutation(input: MyMutationInput!): MyMutationOutput!
}
```

Allowing you to define a mutation:

```js
const CreateImageCard = GraphQL.mutation('createImageCard', { key: 'String!', lint: 'Boolean' }) `{
  image {
    key
    width
    height
  }
}`

// usage

CreateImageCard({ key: '2016/07/02/my-file.jpg', lint: false })
  .then(console.log.bind(console))
// => { image: { key: '2016/07/02/my-file.jpg', width: 500, height: 300  } }
```

Which is translated to:
```graphql
mutation CreateImageCard($input: CreateImageCardInput!) {
  createImageCard(input: $input) {
    clientMutationId
    ... on CreateImageCardPayload {
      image {
        key
        width
        height
      }
    }
  }
}
```

Evaluated with the variables:
```json
{
  "input": {
    "clientMutationId": "SOME_GENERATED_ID",
    "key": "2016/07/02/my-file.jpg",
    "lint": false
  }
}
```

# Fragment

```purs
GraphQL.fragment a :: ( name :: String, type :: String? ) -> QueryString a -> Fragment a
```

```js
const SitePath = GraphQL.fragment('PathOfSite', 'Path') `{
  id
  name
  slug
}`

const Site = GraphQL.fragment('Site') `{
  id
  name
  paths {
    ${SitePath}
  }
}`

// usage

const MyComplexQuery = GraphQL.query('MyComplexQuery') `{
  site(key: "bustle") {
    ${Site}
  }
  path(id: 2271) {
    ${SitePath}
  }
}`

MyComplexQuery()
  .then(console.log.bind(console))
// => { site: { id: ... }, path: { id: ... } }
```

Translates to the query:

```graphql
query MyComplexQuery {
  site(key: "bustle") {
    ...Site
  }
  path(id: 2271) {
    ...SitePath
  }
}

fragment Site on Site {
  id
  name
  paths {
    ...SitePath
  }
}

fragment PathOfSite on Path {
  id
  name
  slug
}
```

If no `type` argument is given, it will default to being the same as `name`

# Unions

Template strings aren't so great at dealing with arrays, so a utility function is exposed
to expand unions of fragments:

```js
const ClipArticle = GraphQL.fragment(`ClipArticle`) `{
  id
  article {
    title
  }
}`

const ClipPost = GraphQL.fragment('ClipPost') `{
  id
  post {
    title
  }
}`

const Clip = GraphQL.union(ClipArticle, ClipPost)

// usage

const unionQuery = GraphQL.query('MyUnionQuery') `{
  clips(ids: [ 630, 656, 659 ]) {
    ${Clip}
  }
}`
```

This method is variadic, i.e. it is of the form `GraphQL.union(fragment1, fragment2, fragment3, ...)`

# Partial

The `GraphQL.partial` method is highly discouraged in favour of real fragments, however can be useful
in certain cases such as Relay connections where a common pattern is used but there's no clear type or interface:

```js

```

Note that for all of the above methods,
these template strings offer special support for `GraphQL.fragment` and `GraphQL.union` instances,
but in the end are still plain old strings. Therefore, any piece of GraphQL syntax is valid in the string.

```js
// e.g. the valid will work exactly as you'd expect:

const myFragment = GraphQL.fragment('SomeComplexType') `{
  __typename
  ... on SomeType {
    foo
    bar
    baz {
      id
      ... on SomeNestedType {
        foo
      }
    }
  }
  ... on SomeOtherOption {
    ${SomeFragment}
  }
}`
```

