import { Input } from "@/components/ui/input";

/**
 * The name of a trucker. It suggests the providers of the accounting by their full names, so the one picked is the one
 * the costs know. Another trucker can still be typed. The browser's own memory of past entries is off, since it keeps
 * every spelling anyone ever typed.
 */
export function TruckerInput({ id, name, defaultValue = "", names }: { id: string; name: string; defaultValue?: string; names: string[] }) {
  const listId = `${id}-providers`;
  return (
    <>
      <Input id={id} name={name} defaultValue={defaultValue} list={listId} autoComplete="off" />
      <datalist id={listId}>
        {names.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
    </>
  );
}
