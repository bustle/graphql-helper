import babel from 'rollup-plugin-babel'

export default {
  entry: 'src.js',
  targets: [{
    dest: 'dist/graphql-helper.js',
    format: 'umd',
    moduleName: 'GraphQL'
  }, {
    dest: 'dist/graphql-helper.es.js',
    format: 'es'
  }],
  plugins: [
    babel({
      babelrc: false,
      presets: [['es2015', { modules: false }]],
      plugins: ['transform-flow-comments']
    })
  ]
}
