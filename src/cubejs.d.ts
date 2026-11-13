declare module 'cubejs' {
  export default class Cube {
    constructor();
    static initSolver(): void;
    static fromString(facelets: string): Cube;
    move(alg: string): this;
    asString(): string;
    solve(maxDepth?: number): string;
  }
}
