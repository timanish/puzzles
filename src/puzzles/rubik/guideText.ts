// Text of the guide under the solver. It is kept as data because the questions
// are also published as structured data for search engines.

export const HOW_TO = [
  {
    title: 'Scan',
    text: 'Turn the cube slowly in front of the camera until it has seen all six sides. Any order works, and it does not matter which way up the cube is.',
  },
  {
    title: 'Check',
    text: 'Compare the unfolded cube on screen with the real one. Tap a square to repaint it if the camera read a color wrong.',
  },
  {
    title: 'Solve',
    text: 'Follow the moves one at a time on an animated 3D cube. Each move comes with its notation and a plain description.',
  },
];

export const NOTATION = [
  { symbol: 'U', meaning: 'Top face, a quarter turn clockwise' },
  { symbol: 'D', meaning: 'Bottom face, a quarter turn clockwise' },
  { symbol: 'R', meaning: 'Right face, a quarter turn clockwise' },
  { symbol: 'L', meaning: 'Left face, a quarter turn clockwise' },
  { symbol: 'F', meaning: 'Front face, a quarter turn clockwise' },
  { symbol: 'B', meaning: 'Back face, a quarter turn clockwise' },
  { symbol: "R'", meaning: 'An apostrophe turns the face counterclockwise instead' },
  { symbol: 'R2', meaning: 'A 2 turns the face halfway round' },
];

export const FAQ = [
  {
    question: 'Is the solver free?',
    answer: 'Yes. It is free, it needs no account and it has nothing to install. It runs in the browser on a phone, tablet or computer.',
  },
  {
    question: 'Does the camera picture get uploaded?',
    answer: 'No. The picture is read on your own device and is never sent anywhere. The app has no server that could receive it.',
  },
  {
    question: 'Do I have to scan the sides in a certain order?',
    answer: 'No. Show the six sides in any order and at any rotation. Roll the cube from one side to the next without putting it down, so the app can follow how the sides connect.',
  },
  {
    question: 'Does it work with stickerless cubes?',
    answer: 'Yes. The scan looks for the outline of the whole side instead of single stickers, so cubes without dark gaps between the pieces work too.',
  },
  {
    question: 'What if the camera reads a color wrong?',
    answer: 'You check the colors before the solve starts. Pick the right color and tap the square to fix it. The app also tells you when the colors cannot belong to a real cube, for example when a corner is twisted.',
  },
  {
    question: 'How many moves does the solution take?',
    answer: 'The Fastest solution takes 22 moves or fewer. A cube that is within nine moves of solved gets the shortest solution there is. The Beginner method takes more moves, because it solves the cube layer by layer and explains each stage.',
  },
  {
    question: 'Can I solve a cube without a camera?',
    answer: 'Yes. Choose "Enter colors by hand" and paint the cube on screen.',
  },
  {
    question: 'Which cubes does it solve?',
    answer: 'It solves the standard 3x3 cube. Other sizes such as 2x2 and 4x4 are not supported.',
  },
];
