import test from 'ava'
import fetch from 'isomorphic-fetch'

import * as GraphQL from '../src'

async function graphql(op, vars, token) {
  const url = token
    ? 'https://chi.bustle.com/authorized'
    : 'https://chi.bustle.com/'

  // if we have a mutation, decorate the input
  const variables = op.__GRAPHQL_MUTATION__
    ? { input: vars }
    : vars

  // make request
  const { data, errors } = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Authorization': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: op.toString(),
      variables: JSON.stringify(variables),
      token,
    }),
  }).then(r => r.json())

  if (errors)
    throw errors

  return op.__GRAPHQL_MUTATION__
    ? data.payload
    : data
}


// QUERY

const query = GraphQL.query('MyQuery', { key: "String!" }) `{
  env
  site(key: $key) {
    id
    name
  }
}`

test('GraphQL.query', async t => {
  const { env, site } = await graphql(query, { key: "Bustle" })
  t.truthy(env)
  t.truthy(site)
})

// MUTATION

const mutation = GraphQL.mutation('createImageFromKey', {
  key: "String!",
  lint: "Boolean",
}) `{
  image {
    id
    key
    url
    width
    height
  }
}`

const token = "SECRET"

test('GraphQL.mutation', async t => {
  t.throws(
    graphql(mutation, { key: "2016/4/1/518314746.jpg" }, token)
  )
  // this test will pass if provided a valid token
  // const { image } = await graphql(mutation, { key: "2016/4/1/518314746.jpg" }, token)
  // t.truthy(image)
})


// Fragment

const SitePage = GraphQL.fragment('PageOfSite', 'Page') `{
  id
  name
  slug
}`

const Site = GraphQL.fragment('Site') `{
  id
  name
  pageConnection(first: 10) {
    nodes {
      ${SitePage}
    }
  }
}`

// usage

const queryWithFragment = GraphQL.query('MyComplexQuery') `{
  site(key: "Bustle") {
    ${Site}
  }
  pageBySlug(siteKey: "Bustle", slug: "") {
    ${SitePage}
  }
}`

test('GraphQL.fragment', async t => {
  const result = await graphql(queryWithFragment)
  t.truthy(result)
})


// Error

const errQuery = GraphQL.query('MyFailingQuery') `{
  nonExistantField
}`

test('GraphQL.partial', async t => {
  t.throws(
    graphql(errQuery)
  )
})
