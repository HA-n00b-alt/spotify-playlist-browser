import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function askConfirm(question, { defaultYes = false } = {}) {
  if (!input.isTTY) {
    return false;
  }

  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} ${hint} `)).trim().toLowerCase();
    if (!answer) {
      return defaultYes;
    }
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}
