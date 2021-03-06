# graphql-helper [![Build Status](https://travis-ci.org/bustlelabs/graphql-helper.svg?branch=master)](https://travis-ci.org/bustlelabs/graphql-helper)

A GraphQL helper library for constructing queries and accumulating fragments.
This library is meant for statically determined queries, and encourages the use of variables and fragments over string concatenation.

This library is fairly short and written in a literate style, it is encouraged to take the time to read through the source code.


```bash
yarn add graphql-helper
```


## Example:

```js
import { fragment, query } from 'graphql-helper'
import fetch from 'isomorphic-fetch'

const Contributor = fragment('Contributor', 'User') `{
  name
  slug
}`

const PostPage = fragment('PostPage', 'Post') `{
  title
  body
  contributors {
    ${Contributor}
  }
}`

const PostQuery = query('PostQuery', { postId: 'ID!' }) `{
  post(id: $postId) {
    id
    ${PostPage}
  }
}`


// Write your own app-specific dispatcher.
// In this case, we just have a simple function, but this could live in
// a react library, an elm effects module, an ember service...

function runQuery(op, vars): Promise<Result> {
  return fetch('http://localhost:3000/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: op,
        variables: vars,
      }),
    })
    .then(r => r.json())
    .then({ data, errors }) => errors ? Promise.reject(errors) : Promise.resolve(data))
   })
}


// Usage
runQuery(PostQuery, { postId: 123 })
  .then(data => {
    // data = {
    //   post: {
    //     id: 123,
    //     title: "foo",
    //     body: "bar",
    //     contributors: [
    //       { name: 'Daria Morgendorffer', slug: '/daria' },
    //       { name: 'Jane Lane', slug: '/jane' }
    //     ]
    //   }
    // }
  })

```


## Fragments

A fragment represents the data requirements of some component or aspect of an application.

Consider the graphql fragment:

```graphql
fragment FullPost on Post {
  id
  slug
  title
  body
  contributors {
    ...Contributor
  }
  author {
    name
    ...Author
  }
}
```

Suppose `Author` and `Contributor` are fragment definitions that we have already defined, then we can define `FullPost` as follows:

```js
import { fragment } from 'graphql-helper'
import { Author, Contributor } from 'some-module'

const FullPost = fragment('FullPost', 'Post') `{
  id
  slug
  title
  body
  contributors {
    ${Contributor}
  }
  author {
    name
    ${Author}
  }
}`
```


## Queries

A query represents some operation that fetches data.

Consider the GraphQL query:

```graphql
query GetPost($id: ID!) {
  post(id: $id) {
    __typename
    id
    ...FullPost
  }
}
```

Suppose `FullPost` is already defined above. Then we can define this query as follows:

```js
const GetPost = query('GetPost', { id: 'ID!' }) `{
  post(id: $id) {
    __typename
    id
    ${FullPost}
  }
}`
```

And we can open up the resulting query object yields the following:

```js
GetPost.__GRAPHQL_QUERY__
// => true

GetPost.name
// => 'GetPost'

GetPost.definition
// => `query GetPost($id: ID!) {
  post(id: $id) {
    __typename
    id
    ...FullPost
  }
}`

GetPost.fragments
// => { FullPost, Author, Contributor }

// the following are equivalent:
GetPost.definition
GetPost.toString()
// => `query GetPost($id: ID!) {
  post(id: $id) {
    __typename
    id
    ...FullPost
  }
}

fragment FullPost on Post {
  id
  slug
  id
  slug
  title
  body
  contributors {
    ...Contributor
  }
  author {
    name
    ...Author
  }
}

fragment Contributor on User {
  ...etc
`
```


## Mutations

A mutation represents some operation which changes data.

Consider a relay-compatible mutation `createPost`:

```graphql
type RootMutation {
  ...
  createPost(input: CreatePostInput): CreatePostPayload
  ...
}

input CreatePostInput {
  clientMutationId: String!
  title: String!
  body: String!
}

type CreatePostPayload {
  clientMutationId: String!
  post: Post!
}

```

Then there exists a natural, "free mutation" that performs just that mutation:

```graphql
mutation CreatePost($input: CreatePostInput) {
  payload: createPost(input: $Input) {
    # application decides which fields to fetch
    clientMutationId
    post {
      ...FullPost
    }
  }
}
```

Noting that the `clientMutationId` is a special field, we provide a condensed syntax for such a query as follows:

```js
const CreatePost = GraphQL.mutation('createPost', {
  title: 'String!',
  body: 'String!',
}) `{
  clientMutationId
  post {
    ${FullPost}
  }
}`
```

And we can open up the resulting query object yields the following:

```js
CreatePost.__GRAPHQL_MUTATION__
// => true

CreatePost.name
// => 'CreatePost'

CreatePost.definition
// => `mutation CreatePost($input: CreatePostInput!) {
  payload: createPost(input: $input) {
    clientMutationId
    post {
      ...FullPost
    }
  }
}`

CreatePost.fragments
// => { FullPost, Author, Contributor }

// the following are equivalent:
CreatePost.definition
CreatePost.toString()
// => `mutation CreatePost($input: CreatePostInput!) {
  payload: createPost(input: $input) {
    clientMutationId
    post {
      ...FullPost
    }
  }
}

fragment FullPost on Post {
  id
  slug
  id
  slug
  title
  body
  contributors {
    ...Contributor
  }
  author {
    name
    ...Author
  }
}

fragment Contributor on User {
  ...etc
`
```


## Document

The `GraphQL.document([ QueryOne, QueryTwo, MutationOne, ... ])` method generates a complete document object which is useful for persisted queries.
This should never appear in your application logic, although build tools may use this to heavily optimize a production build by persisting a document at build time.

See source code for type declaration and implementation.

## TODO
- Support for static analysis and pre-compilation of queries
