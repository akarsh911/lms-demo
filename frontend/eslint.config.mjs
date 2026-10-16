import nextConfig from 'eslint-config-next';

// `next lint` was removed in Next 16 — this config is invoked by `eslint .`
// directly. The sibling console app ships no ESLint config at all; that gap is
// deliberately not inherited.
const config = [
  { ignores: ['.next/**', '.vercel/**', 'node_modules/**', 'next-env.d.ts'] },
  // eslint-config-next default-exports an ARRAY, not a factory. Calling it
  // throws, which silently meant `npm run lint` never ran at all.
  ...nextConfig,
  {
    rules: {
      // The whole point of the entitlement design: nothing renders off a role
      // or persona identity. A persona narrows a set; it never branches logic.
      // Comparing a persona/role to a string literal is the exact shape of the
      // `if (role === 'teacher')` the architecture exists to make impossible,
      // so it is a lint error rather than a code-review convention.
      //
      // Comparing two *variables* stays legal, because that is how the server
      // verifies a URL segment against a held persona.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "BinaryExpression[operator=/^[=!]==?$/][left.property.name=/^(role|roleName|persona|personaSlug|slug)$/][right.type='Literal']",
          message:
            'Do not branch on a role/persona identity. Gate on a CAS feature key instead, or intersect with a persona preset. See docs/DECISIONS.md.',
        },
        {
          selector:
            "BinaryExpression[operator=/^[=!]==?$/][right.property.name=/^(role|roleName|persona|personaSlug|slug)$/][left.type='Literal']",
          message:
            'Do not branch on a role/persona identity. Gate on a CAS feature key instead, or intersect with a persona preset. See docs/DECISIONS.md.',
        },
      ],
    },
  },
]

export default config;
