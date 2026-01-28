import githubLogo from "./assets/github.svg";
import viteLogo from "/vite.svg";
import { useCounter } from "./hooks/useCounter";

function App() {
  const { count, increment } = useCounter();

  return (
    <div
      className={`
        flex min-h-screen min-w-[320px] items-center justify-center bg-[#242424]
        text-[rgba(255,255,255,0.87)]
      `}
    >
      <div className="mx-auto max-w-[1280px] px-8 text-center">
        <div className="mb-8 flex justify-center gap-8">
          <a href="https://vite.dev" target="_blank">
            <img
              src={viteLogo}
              className={`
                h-24 p-6 transition-[filter] duration-300
                hover:drop-shadow-[0_0_2em_#646cffaa]
              `}
              alt="Vite logo"
            />
          </a>
          <a
            href="https://topheman.github.io/me/"
            target="_blank"
            title="topheman's website"
          >
            <img
              src={githubLogo}
              className={`
                h-24 animate-spin p-6 invert transition-[filter] duration-300
                [animation-duration:20s]
                hover:drop-shadow-[0_0_2em_#61dafbaa]
              `}
              alt="GitHub logo"
            />
          </a>
        </div>
        <h1 className="mb-8 text-5xl leading-tight">
          {import.meta.env.VITE_TITLE}
        </h1>
        <div className="p-8">
          <button
            onClick={increment}
            className={`
              cursor-pointer rounded-lg border border-transparent bg-[#1a1a1a]
              px-5 py-2.5 font-sans text-base font-medium
              transition-[border-color] duration-[0.25s]
              hover:border-[#646cff]
              focus-visible:outline-4 focus-visible:outline-offset-2
            `}
          >
            count is {count}
          </button>
          <p className="mt-4">
            Edit <code className="font-mono">src/App.tsx</code> and save to test
            HMR
          </p>
        </div>
        <p className="text-[#888]">
          Click on the Vite and GitHub logos to learn more
        </p>
      </div>
    </div>
  );
}

export default App;
