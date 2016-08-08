import test from 'ava'

import GraphQL from '../src'

test.before(t => {
  GraphQL.configure(
    { host: 'https://chi.bustle.com'
    }
  )
})

// QUERY

const query = GraphQL.query('MyQuery', { key: "String!" }) `{
  env
  site(key: $key) {
    id
    name
  }
}`

test('GraphQL.query', async t => {
  const result = await query({ key: "bustle" })
  t.truthy(result)
})

// MUTATION

const mutation = GraphQL.mutation('createImageCard', { key: "String!", lint: "Boolean" }) `{
  image {
    id
    key
    url
    width
    height
  }
}`

test('GraphQL.mutation', async t => {
  /*
  GraphQL.configure(
    { host: 'https://chi.bustle.com/authorized'
    , headers: { 'Authorization': 'MY_TOKEN'
               }
    }
  )*/
  t.throws(mutation({ key: "2016/4/1/518314746.jpg" }))
})

// Fragment

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

const queryWithFragment = GraphQL.query('MyComplexQuery') `{
  site(key: "bustle") {
    ${Site}
  }
  path(id: 2271) {
    ${SitePath}
  }
}`

test('GraphQL.fragment', async t => {
  const result = await queryWithFragment()
  t.truthy(result)
})

// Union

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

const queryWithUnion = GraphQL.query('MyUnionQuery') `{
  clips(ids: [ 630, 656, 659 ]) {
    ${Clip}
  }
}`

test('GraphQL.union', async t => {
  const result = await queryWithUnion()
  t.truthy(result)
})

// Partial

const partial = GraphQL.partial`
  site(key: $key) {
    ${Site}
  }
`

const queryWithPartial = GraphQL.query('MyOtherQuery', { key: "String!" }) `{
  env
  ${partial}
}`

test('GraphQL.partial', async t => {
  const result = await queryWithPartial({ key: 'String!' })
  t.truthy(result)
})

// Error

const errQuery = GraphQL.query('MyFailingQuery') `{
  nonExistantField
}`

test('GraphQL.partial', async t => {
  t.throws(errQuery())
})

// Batch

test('GraphQL.batch', async t => {
  const result = await GraphQL.batch
    ( [ GraphQL.query('Batch1', { siteKey: 'String!' }) `{
          env
          site(key: $siteKey) {
            id
            name
          }
        }`
      , GraphQL.query('Batch2', { pageId: 'Int!' }) `{
          page(id: $pageId) {
            id
            name
          }
        }`
      , GraphQL.query('Batch3', { cardIds: '[Int!]!' }) `{
          cards(ids: $cardIds) {
            __typename
          }
        }`
      ]
    , { siteKey: "bustle"
      , pageId: 3132
      , cardIds: [ 630, 636 ]
      }
    )

  // => [ { env: ... }
  //    , { page: ... }
  //    , { cards: [ ... ] }
  //    ]

  t.truthy(result[0])
  t.truthy(result[1])
  t.truthy(result[2])
})
