import { A, S, T, type ChapterSeed } from './mindmap-seed';

export const LIGHT: ChapterSeed = {
  topics: [
    T('Light and vision', 160, [
      S('What light does', [
        A('Light', 'd', 'Light is a form of energy that enables us to see objects.'),
        A('Rectilinear propagation', 'l', 'Light seems to travel in straight lines, as the sharp shadow of an opaque object shows.'),
        A('Ray of light', 'd', 'A straight line drawn along the direction of propagation of light is called a ray of light.'),
      ]),
    ]),
    T('Reflection of light', 161, [
      S('Bouncing back', [
        A('Reflection', 'd', 'A highly polished surface such as a mirror reflects most of the light falling on it.'),
      ]),
      S('The laws', [
        A('Laws of reflection', 'l', 'The angle of incidence is equal to the angle of reflection, and the incident ray, the normal and the reflected ray lie in the same plane.', {
          pyq: [[2023, 2, 'State the laws of reflection of light.']],
          note: 'Both laws, both sentences. Half marks are lost by stating only the angle law.',
        }),
        A('Angle of incidence', 'd', 'The angle of incidence is the angle between the incident ray and the normal at the point of incidence.'),
        A('Angle of reflection', 'd', 'The angle of reflection is the angle between the reflected ray and the normal.'),
      ]),
    ]),
    T('Plane mirror images', 161, [
      S('Properties of the image', [
        A('Plane mirror image', 'd', 'The image formed by a plane mirror is always virtual and erect, and of the same size as the object.'),
        A('Virtual image', 'd', 'A virtual image cannot be obtained on a screen.'),
        A('Lateral inversion', 'd', 'The image in a plane mirror is laterally inverted.'),
      ]),
    ]),
    T('Spherical mirrors', 162, [
      S('Two kinds', [
        A('Spherical mirror', 'd', 'A spherical mirror has a reflecting surface that is part of a hollow sphere of glass.'),
        A('Concave mirror', 'd', 'A spherical mirror whose reflecting surface is curved inwards, facing the centre of the sphere, is a concave mirror.', {
          pyq: [[2022, 1, 'Name the type of mirror used by dentists to see large images of teeth.']],
        }),
        A('Convex mirror', 'd', 'A spherical mirror whose reflecting surface is curved outwards is a convex mirror.'),
      ]),
      S('Key points', [
        A('Pole', 'd', 'The centre of the reflecting surface of a spherical mirror is a point called the pole.'),
        A('Centre of curvature', 'd', 'The reflecting surface of a spherical mirror forms part of a sphere whose centre is the centre of curvature.'),
      ]),
    ]),
    T('Mirror terms', 163, [
      S('Lengths', [
        A('Radius of curvature', 'd', 'The radius of the sphere of which the reflecting surface of a spherical mirror forms a part is its radius of curvature.'),
        A('Focal length', 'd', 'The distance between the pole and the principal focus of a spherical mirror is called its focal length.'),
      ]),
      S('Axis and focus', [
        A('Principal axis', 'd', 'A straight line passing through the pole and the centre of curvature of a spherical mirror is its principal axis.'),
        A('Principal focus', 'd', 'Rays parallel to the principal axis meet, or appear to diverge from, a point on the principal axis called the principal focus.', {
          pyq: [[2021, 2, 'Define the principal focus of a concave mirror.']],
        }),
      ]),
    ]),
    T('Relation between focal length and radius', 165, [
      S('The relation', [
        A('Focal length formula', 'f', 'For spherical mirrors of small apertures, the radius of curvature is equal to twice the focal length, R = 2f.', {
          pyq: [[2020, 1, 'The radius of curvature of a spherical mirror is 20 cm. What is its focal length?']],
        }),
        A('Aperture', 'd', 'The diameter of the reflecting surface of a spherical mirror is called its aperture.'),
      ]),
    ]),
    T('Image formation by a concave mirror', 166, [
      S('Object far away', [
        A('Object at infinity', 'p', 'When the object is at infinity, a highly diminished, point-sized image is formed at the focus.'),
        A('Object beyond C', 'p', 'When the object is beyond C, a diminished, real and inverted image is formed between F and C.'),
      ]),
      S('Object close to the mirror', [
        A('Object at C', 'p', 'When the object is at C, a real, inverted image of the same size is formed at C.'),
        A('Object between F and P', 'p', 'When the object is between F and P, an enlarged, virtual and erect image is formed behind the mirror.', {
          pyq: [[2024, 3, 'Draw a ray diagram to show the image formed by a concave mirror when the object is between its pole and focus. State the nature of the image.']],
          note: 'This is the one case that gives a virtual image. Lead with it in any comparison table.',
        }),
      ]),
      S('Real images', [
        A('Real image', 'd', 'A real image is formed where reflected rays actually meet, and it can be obtained on a screen.'),
      ]),
    ]),
    T('Ray diagrams', 167, [
      S('Rules for rays', [
        A('Parallel ray rule', 'l', 'A ray parallel to the principal axis, after reflection, passes through the principal focus of a concave mirror.'),
        A('Ray through centre of curvature', 'l', 'A ray passing through the centre of curvature of a concave mirror is reflected back along the same path.'),
        A('Oblique ray at pole', 'l', 'A ray incident obliquely at the pole is reflected obliquely, making equal angles with the principal axis.'),
      ]),
    ]),
    T('Uses of concave mirrors', 169, [
      S('Everyday uses', [
        A('Torch reflector', 'a', 'Concave mirrors are commonly used in torches, search-lights and vehicle headlights to get powerful parallel beams of light.', {
          pyq: [[2023, 1, 'Why are concave mirrors used in the headlights of vehicles?']],
        }),
        A('Shaving mirror', 'a', 'Concave mirrors are often used as shaving mirrors to see a larger image of the face.'),
      ]),
      S('Using sunlight', [
        A('Solar furnace', 'a', 'Large concave mirrors are used to concentrate sunlight to produce heat in solar furnaces.'),
      ]),
    ]),
    T('Image formation by a convex mirror', 169, [
      S('Always the same kind', [
        A('Convex mirror image', 'p', 'A convex mirror always forms a virtual, erect and diminished image.'),
        A('Field of view', 'd', 'Convex mirrors enable a driver to view a much larger area than would be possible with a plane mirror.'),
      ]),
      S('On vehicles', [
        A('Rear-view mirror', 'a', 'Convex mirrors are used as rear-view mirrors in vehicles because they give an erect image and a wider field of view.', {
          pyq: [[2022, 2, 'Why do we prefer a convex mirror as a rear-view mirror in vehicles?']],
        }),
      ]),
    ]),
    T('Sign convention for mirrors', 170, [
      S('Measuring distances', [
        A('New Cartesian sign convention', 'l', 'Distances are measured from the pole; those measured along the direction of incident light are positive and those against it are negative.', {
          note: 'Draw the arrow of incident light first, every time. The signs follow from the arrow.',
        }),
        A('Object distance', 'd', 'The distance of the object from the pole is the object distance, u.'),
        A('Image distance', 'd', 'The distance of the image from the pole is the image distance, v.'),
      ]),
    ]),
    T('Mirror formula and magnification', 171, [
      S('The formula', [
        A('Mirror formula', 'f', 'The mirror formula is 1/v + 1/u = 1/f.', {
          pyq: [[2024, 3, 'An object is placed 30 cm in front of a concave mirror of focal length 15 cm. Find the position and nature of the image.']],
        }),
        A('Mirror numerical', 'w', 'An object 10 cm from a convex mirror of focal length 15 cm gives an image 6 cm behind the mirror, virtual and erect.'),
      ]),
      S('Magnification', [
        A('Magnification', 'd', 'Magnification is the ratio of the height of the image to the height of the object.'),
        A('Negative magnification', 'e', 'A negative sign in the value of magnification indicates that the image is real and inverted.', {
          ex: 'A mirror gives a magnification of −2. What can you say about the image and the mirror?',
        }),
      ]),
    ]),
    T('Refraction of light', 174, [
      S('Change of direction', [
        A('Refraction', 'd', 'Light changes its direction when it passes obliquely from one transparent medium into another; this is refraction.', {
          pyq: [[2021, 1, 'What is refraction of light?']],
        }),
        A('Apparent depth', 'a', 'The bottom of a tank of water appears to be raised because of refraction.'),
      ]),
      S('Which way it bends', [
        A('Bending towards normal', 'e', 'A ray of light travelling from a rarer medium to a denser medium bends towards the normal.'),
        A('Bending away from normal', 'e', 'A ray of light travelling from a denser medium to a rarer medium bends away from the normal.'),
      ]),
    ]),
    T('Refraction through a glass slab', 175, [
      S('What emerges', [
        A('Glass slab', 'd', 'A rectangular glass slab has two parallel faces through which light enters and leaves.'),
        A('Emergent ray', 'd', 'The ray that leaves the second face of the slab is called the emergent ray.'),
        A('Lateral displacement', 'd', 'The emergent ray is parallel to the direction of the incident ray but shifted sideways.', {
          pyq: [[2020, 3, 'Draw a ray diagram for refraction through a rectangular glass slab and mark the lateral displacement.']],
        }),
      ]),
    ]),
    T('Laws of refraction', 176, [
      S('The two laws', [
        A('Laws of refraction', 'l', 'The incident ray, the refracted ray and the normal at the point of incidence all lie in the same plane.'),
        A("Snell's law", 'l', 'The ratio of the sine of the angle of incidence to the sine of the angle of refraction is a constant for a given colour of light and pair of media.', {
          pyq: [[2023, 2, 'State Snell’s law of refraction.']],
        }),
      ]),
      S('Why light bends', [
        A('Speed of light in media', 'e', 'Refraction is due to the change in the speed of light as it enters from one transparent medium to another.'),
      ]),
    ]),
    T('Refractive index', 176, [
      S('Defining it', [
        A('Refractive index', 'd', 'The refractive index of a medium is the ratio of the speed of light in vacuum to the speed of light in the medium.', {
          pyq: [[2024, 2, 'The refractive index of diamond is 2.42. What is the meaning of this statement?']],
          note: 'Say what the number means: light travels 2.42 times slower in diamond than in vacuum.',
        }),
        A('Absolute refractive index', 'd', 'The refractive index of a medium with respect to vacuum is its absolute refractive index.'),
        A('Optical density', 'd', 'A medium with a larger refractive index is optically denser than a medium with a lower refractive index.'),
      ]),
      S('Values to know', [
        A('Refractive index of water', 'n', 'The refractive index of water is 1.33 and that of crown glass is 1.52.'),
        A('Diamond', 'n', 'Diamond has the highest refractive index in the table, 2.42.'),
      ]),
    ]),
    T('Spherical lenses', 178, [
      S('Two kinds', [
        A('Lens', 'd', 'A transparent material bound by two surfaces, of which one or both are spherical, forms a lens.'),
        A('Convex lens', 'd', 'A convex lens is thicker at the middle than at the edges and converges light rays.'),
        A('Concave lens', 'd', 'A concave lens is thicker at the edges than at the middle and diverges light rays.'),
      ]),
      S('Key points', [
        A('Optical centre', 'd', 'The central point of a lens is its optical centre, and a ray through it passes without deviation.'),
        A('Focus of a lens', 'd', 'A lens has two principal foci, one on each side.'),
      ]),
    ]),
    T('Image formation by lenses', 180, [
      S('Convex lens', [
        A('Convex lens images', 'p', 'A convex lens can form either real and inverted or virtual and erect images, depending on the position of the object.'),
        A('Magnifying glass', 'a', 'An object between F1 and the optical centre of a convex lens gives an enlarged, virtual and erect image, which is how a magnifying glass works.', {
          pyq: [[2022, 2, 'Where should an object be placed in front of a convex lens to get a virtual, enlarged image?']],
        }),
      ]),
      S('Concave lens', [
        A('Concave lens image', 'p', 'A concave lens always gives a virtual, erect and diminished image, irrespective of the position of the object.'),
      ]),
      S('Rays through lenses', [
        A('Lens ray diagram', 'l', 'A ray parallel to the principal axis, after refraction from a convex lens, passes through the principal focus on the other side.'),
      ]),
    ]),
    T('Lens formula and magnification', 184, [
      S('The formula', [
        A('Lens formula', 'f', 'The lens formula is 1/v − 1/u = 1/f.', {
          pyq: [[2023, 3, 'A concave lens has a focal length of 15 cm. At what distance should the object be placed so that it forms an image 10 cm from the lens?']],
        }),
        A('Lens numerical', 'w', 'A concave lens of focal length 15 cm forms an image 10 cm from it when the object is 30 cm away.'),
      ]),
      S('Magnification', [
        A('Lens magnification', 'f', 'The magnification produced by a lens is the ratio of the image distance to the object distance, m = v/u.'),
      ]),
    ]),
    T('Power of a lens', 186, [
      S('Defining power', [
        A('Power of a lens', 'd', 'The power of a lens is the reciprocal of its focal length, expressed in metres.', {
          pyq: [
            [2024, 2, 'Define the power of a lens and state its SI unit.'],
            [2021, 1, 'The power of a lens is −2.0 D. What type of lens is it?'],
          ],
          note: 'Convert centimetres to metres before taking the reciprocal. This is the commonest one-mark error.',
        }),
        A('Dioptre', 'd', 'The SI unit of power of a lens is the dioptre.'),
      ]),
      S('Sign and combination', [
        A('Positive power', 'x', 'The power of a convex lens is positive and that of a concave lens is negative.'),
        A('Combined power', 'l', 'The net power of lenses placed in contact is the algebraic sum of their individual powers.', {
          ex: 'Two lenses of power +2.0 D and −0.5 D are placed in contact. Find the net power and focal length.',
        }),
      ]),
    ]),
  ],
  relations: [
    ['Ray of light', 'requires', 'Rectilinear propagation', 'A ray can be drawn because light travels in straight lines.'],
    ['Reflection', 'requires', 'Laws of reflection', 'Every reflection obeys the laws of reflection.'],
    ['Laws of reflection', 'requires', 'Angle of incidence', 'The laws are stated in terms of the angle of incidence.'],
    ['Laws of reflection', 'requires', 'Angle of reflection', 'The laws are stated in terms of the angle of reflection.'],
    ['Plane mirror image', 'requires', 'Laws of reflection', 'The plane mirror image follows from the laws of reflection.'],
    ['Plane mirror image', 'kind_of', 'Virtual image', 'A plane mirror image is a virtual image.'],
    ['Lateral inversion', 'part_of', 'Plane mirror image', 'Lateral inversion is a property of a plane mirror image.'],
    ['Concave mirror', 'kind_of', 'Spherical mirror', 'A concave mirror is a spherical mirror.'],
    ['Convex mirror', 'kind_of', 'Spherical mirror', 'A convex mirror is a spherical mirror.'],
    ['Concave mirror', 'contrasts_with', 'Convex mirror', 'A concave mirror curves inwards; a convex mirror curves outwards.'],
    ['Pole', 'part_of', 'Spherical mirror', 'The pole is the centre of the mirror’s surface.'],
    ['Radius of curvature', 'defined_by', 'Centre of curvature', 'The radius of curvature is measured to the centre of curvature.'],
    ['Principal axis', 'requires', 'Pole', 'The principal axis passes through the pole.'],
    ['Principal axis', 'requires', 'Centre of curvature', 'The principal axis passes through the centre of curvature.'],
    ['Focal length', 'defined_by', 'Principal focus', 'The focal length is the distance to the principal focus.'],
    ['Focal length formula', 'requires', 'Focal length', 'R = 2f relates the focal length to the radius.'],
    ['Focal length formula', 'requires', 'Radius of curvature', 'R = 2f relates the radius to the focal length.'],
    ['Focal length formula', 'requires', 'Aperture', 'R = 2f holds for mirrors of small aperture.'],
    ['Object at infinity', 'causes', 'Real image', 'An object at infinity gives a real image at the focus.'],
    ['Object beyond C', 'causes', 'Real image', 'An object beyond C gives a real image.'],
    ['Object at C', 'causes', 'Real image', 'An object at C gives a real image.'],
    ['Object between F and P', 'causes', 'Virtual image', 'An object between F and P gives a virtual image.'],
    ['Real image', 'contrasts_with', 'Virtual image', 'A real image can be taken on a screen; a virtual image cannot.'],
    ['Object beyond C', 'follows', 'Object at infinity', 'As the object moves closer from infinity, it passes beyond C.'],
    ['Object at C', 'follows', 'Object beyond C', 'Moving the object closer brings it to C.'],
    ['Parallel ray rule', 'requires', 'Principal focus', 'Parallel rays pass through the principal focus after reflection.'],
    ['Ray through centre of curvature', 'requires', 'Centre of curvature', 'A ray through C returns along its path.'],
    ['Oblique ray at pole', 'requires', 'Laws of reflection', 'A ray at the pole reflects at an equal angle.'],
    ['Torch reflector', 'requires', 'Concave mirror', 'Torches use concave mirrors.'],
    ['Torch reflector', 'requires', 'Principal focus', 'A bulb at the focus gives a parallel beam.'],
    ['Shaving mirror', 'requires', 'Object between F and P', 'A face held within the focus gives an enlarged image.'],
    ['Solar furnace', 'requires', 'Concave mirror', 'Solar furnaces use large concave mirrors.'],
    ['Convex mirror image', 'requires', 'Convex mirror', 'A convex mirror forms this kind of image.'],
    ['Convex mirror image', 'kind_of', 'Virtual image', 'A convex mirror image is always virtual.'],
    ['Rear-view mirror', 'requires', 'Convex mirror image', 'Rear-view mirrors rely on the erect image of a convex mirror.'],
    ['Rear-view mirror', 'requires', 'Field of view', 'Rear-view mirrors rely on the wide field of view.'],
    ['Object distance', 'requires', 'New Cartesian sign convention', 'The sign of u comes from the sign convention.'],
    ['Image distance', 'requires', 'New Cartesian sign convention', 'The sign of v comes from the sign convention.'],
    ['Mirror formula', 'requires', 'Object distance', 'The mirror formula uses the object distance.'],
    ['Mirror formula', 'requires', 'Image distance', 'The mirror formula uses the image distance.'],
    ['Mirror formula', 'requires', 'Focal length', 'The mirror formula uses the focal length.'],
    ['Negative magnification', 'kind_of', 'Magnification', 'A negative magnification is still a magnification.'],
    ['Negative magnification', 'defined_by', 'Real image', 'A negative magnification identifies a real, inverted image.'],
    ['Mirror numerical', 'requires', 'Mirror formula', 'The worked example applies the mirror formula.'],
    ['Speed of light in media', 'causes', 'Refraction', 'A change in the speed of light causes refraction.'],
    ['Refraction', 'causes', 'Apparent depth', 'Refraction makes a tank look shallower.'],
    ['Bending towards normal', 'contrasts_with', 'Bending away from normal', 'Entering a denser medium bends light towards the normal; leaving it bends light away.'],
    ['Bending towards normal', 'requires', 'Optical density', 'Light bends towards the normal on entering an optically denser medium.'],
    ['Lateral displacement', 'requires', 'Glass slab', 'Lateral displacement is seen in a glass slab.'],
    ['Lateral displacement', 'defined_by', 'Emergent ray', 'Lateral displacement is the sideways shift of the emergent ray.'],
    ['Emergent ray', 'follows', 'Bending away from normal', 'The ray bends away from the normal as it emerges from the slab.'],
    ["Snell's law", 'part_of', 'Laws of refraction', 'Snell’s law is the second law of refraction.'],
    ['Refractive index', 'defined_by', "Snell's law", 'The constant in Snell’s law is the refractive index.'],
    ['Refractive index', 'requires', 'Speed of light in media', 'Refractive index compares the speed of light in two media.'],
    ['Absolute refractive index', 'kind_of', 'Refractive index', 'The absolute refractive index is measured against vacuum.'],
    ['Optical density', 'defined_by', 'Refractive index', 'Optical density is judged by refractive index.'],
    ['Refractive index of water', 'kind_of', 'Refractive index', 'Water’s value of 1.33 is a refractive index.'],
    ['Diamond', 'contrasts_with', 'Refractive index of water', 'Diamond, at 2.42, is far denser optically than water.'],
    ['Convex lens', 'kind_of', 'Lens', 'A convex lens is a lens.'],
    ['Concave lens', 'kind_of', 'Lens', 'A concave lens is a lens.'],
    ['Convex lens', 'contrasts_with', 'Concave lens', 'A convex lens converges light; a concave lens diverges it.'],
    ['Optical centre', 'part_of', 'Lens', 'Every lens has an optical centre.'],
    ['Focus of a lens', 'part_of', 'Lens', 'Every lens has two principal foci.'],
    ['Lens', 'contrasts_with', 'Spherical mirror', 'A lens refracts light where a mirror reflects it.'],
    ['Lens', 'requires', 'Refraction', 'A lens works by refraction.'],
    ['Convex lens images', 'requires', 'Convex lens', 'These images are formed by a convex lens.'],
    ['Magnifying glass', 'kind_of', 'Convex lens images', 'A magnifying glass uses one of the convex lens images.'],
    ['Concave lens image', 'requires', 'Concave lens', 'This image is formed by a concave lens.'],
    ['Lens ray diagram', 'requires', 'Focus of a lens', 'Ray diagrams for lenses use the principal focus.'],
    ['Lens ray diagram', 'requires', 'Optical centre', 'Ray diagrams for lenses use the optical centre.'],
    ['Lens formula', 'contrasts_with', 'Mirror formula', 'The lens formula has a minus sign where the mirror formula has a plus.'],
    ['Lens formula', 'requires', 'Focus of a lens', 'The lens formula uses the focal length of the lens.'],
    ['Lens magnification', 'kind_of', 'Magnification', 'Lens magnification is a magnification.'],
    ['Lens numerical', 'requires', 'Lens formula', 'The worked example applies the lens formula.'],
    ['Power of a lens', 'defined_by', 'Focus of a lens', 'Power is the reciprocal of the focal length.'],
    ['Dioptre', 'part_of', 'Power of a lens', 'Power is measured in dioptres.'],
    ['Positive power', 'defined_by', 'Power of a lens', 'The sign of the power tells convex from concave.'],
    ['Combined power', 'requires', 'Power of a lens', 'Combined power adds individual powers.'],
  ],
};
