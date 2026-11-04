import { redirect } from "next/navigation";

/** The sealed verdicts now live on the radar. */
export default function Moves(): never {
  redirect("/radar");
}
