export { loader } from './_app._index.loader.server';

export default function AppIndex() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-semibold mb-2">Welcome to Open Analyst</h1>
        <p className="text-text-secondary text-sm mb-4">
          Create your first project using the project switcher above to get started.
        </p>
      </div>
    </div>
  );
}
