"""Charmbracelet Crush CLI adapter."""

from evaluation_core import AgentRunner, read_prompt_file

class CrushRunner(AgentRunner):
    def execute_agent(self):
        # Crush accepts prompts on stdin; keep the full prompt out of argv.
        prompt_content = read_prompt_file(self.prompt_file)

        cmd = ["crush", "run", "-y"]
        self._run_process(
            cmd,
            input_text=prompt_content,
            display_cmd="crush run -y < prompt",
        )
