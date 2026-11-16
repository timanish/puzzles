import { FAQ, HOW_TO, NOTATION } from './guideText';

/** Explains the solver below its start screen. This is also the text that search engines read. */
export function Guide() {
  return (
    <div className="guide">
      <section>
        <h2>How to solve a Rubik's Cube with your camera</h2>
        <ol className="guide-steps">
          {HOW_TO.map((step) => (
            <li key={step.title}>
              <b>{step.title}.</b> {step.text}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Two ways to solve it</h2>
        <p>
          The <b>Beginner method</b> solves the cube layer by layer in seven stages, from the cross on the bottom to
          the last edges on top. It names the piece that each step places, so you can learn the method while you
          follow it.
        </p>
        <p>
          The <b>Fastest</b> solution is the shortest route the app can find. The moves will not look meaningful, but
          there are far fewer of them.
        </p>
      </section>

      <section>
        <h2>How to read the moves</h2>
        <p>
          Each letter names a face of the cube. Clockwise means clockwise as seen when you look straight at that face.
        </p>
        <table className="notation">
          <tbody>
            {NOTATION.map((row) => (
              <tr key={row.symbol}>
                <th scope="row">
                  <code>{row.symbol}</code>
                </th>
                <td>{row.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Questions and answers</h2>
        <dl className="faq">
          {FAQ.map((item) => (
            <div key={item.question}>
              <dt>{item.question}</dt>
              <dd>{item.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
