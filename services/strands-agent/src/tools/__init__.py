"""Tool registry for the Open Analyst Strands agent."""

from strands import tool

from .command_tools import execute_command
from .file_tools import (
    edit_file,
    glob_search,
    grep_search,
    list_directory,
    read_file,
    write_file,
)
from .project_tools import capture_artifact, collection_overview


def create_file_tools(workspace_dir: str) -> list:
    """Create file and command tools bound to a workspace directory."""

    @tool
    def list_directory_bound(path: str = ".") -> str:
        return list_directory(path=path, workspace_dir=workspace_dir)

    list_directory_bound.__name__ = "list_directory"

    @tool
    def read_file_bound(path: str) -> str:
        return read_file(path=path, workspace_dir=workspace_dir)

    read_file_bound.__name__ = "read_file"

    @tool
    def write_file_bound(path: str, content: str) -> str:
        return write_file(path=path, content=content, workspace_dir=workspace_dir)

    write_file_bound.__name__ = "write_file"

    @tool
    def edit_file_bound(path: str, old_string: str, new_string: str) -> str:
        return edit_file(
            path=path,
            old_string=old_string,
            new_string=new_string,
            workspace_dir=workspace_dir,
        )

    edit_file_bound.__name__ = "edit_file"

    @tool
    def glob_search_bound(pattern: str = "**/*", path: str = ".") -> str:
        return glob_search(pattern=pattern, path=path, workspace_dir=workspace_dir)

    glob_search_bound.__name__ = "glob"

    @tool
    def grep_search_bound(pattern: str, path: str = ".") -> str:
        return grep_search(pattern=pattern, path=path, workspace_dir=workspace_dir)

    grep_search_bound.__name__ = "grep"

    @tool
    def execute_command_bound(command: str, cwd: str = ".") -> str:
        return execute_command(command=command, cwd=cwd, workspace_dir=workspace_dir)

    execute_command_bound.__name__ = "execute_command"

    return [
      list_directory_bound,
      read_file_bound,
      write_file_bound,
      edit_file_bound,
      glob_search_bound,
      grep_search_bound,
      execute_command_bound,
    ]


def _filter_tools(tools: list, allowed_tool_names: set[str] | None) -> list:
    if not allowed_tool_names:
        return tools
    return [
        tool
        for tool in tools
        if (
            getattr(tool, "__name__", "")
            or getattr(tool, "name", "")
        ) in allowed_tool_names
    ]


def create_project_tools(
    workspace_dir: str,
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
    collection_id: str = "",
    collection_name: str = "Task Sources",
    allowed_tool_names: set[str] | None = None,
) -> list:
    """Assemble all tools for a project agent invocation."""
    tools = create_file_tools(workspace_dir)

    @tool
    def collection_overview_bound(collection_id_override: str = "") -> str:
        return collection_overview(
            collection_id=collection_id_override or collection_id,
            project_id=project_id,
            api_base_url=api_base_url,
        )

    collection_overview_bound.__name__ = "collection_overview"

    @tool
    def capture_artifact_bound(
        relative_path: str,
        title: str = "",
        collection_name_override: str = "",
        collection_id_override: str = "",
    ) -> str:
        return capture_artifact(
            relative_path=relative_path,
            title=title,
            collection_id=collection_id_override or collection_id,
            collection_name=collection_name_override or collection_name,
            project_id=project_id,
            api_base_url=api_base_url,
        )

    capture_artifact_bound.__name__ = "capture_artifact"

    # Web, research, and project tools are added in Phase 1.3.3
    try:
        from .web_tools import web_fetch, web_search
        from .research_tools import arxiv_search, hf_daily_papers, hf_paper, deep_research

        tools.extend([
            web_fetch,
            web_search,
            arxiv_search,
            hf_daily_papers,
            hf_paper,
            deep_research,
            collection_overview_bound,
            capture_artifact_bound,
        ])
    except ImportError:
        pass

    return _filter_tools(tools, allowed_tool_names)
