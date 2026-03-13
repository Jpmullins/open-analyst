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
from .generate_tools import generate_file
from .project_tools import capture_artifact, collection_artifact_metadata, collection_overview


def create_file_tools(
    workspace_dir: str,
    project_id: str = "",
    api_base_url: str = "",
    collection_id: str = "",
    collection_name: str = "",
) -> list:
    """Create file and command tools bound to a workspace directory."""

    @tool(name="list_directory")
    def list_directory_bound(path: str = ".") -> str:
        return list_directory(path=path, workspace_dir=workspace_dir)

    @tool(name="read_file")
    def read_file_bound(path: str) -> str:
        return read_file(path=path, workspace_dir=workspace_dir)

    @tool(name="write_file")
    def write_file_bound(path: str, content: str) -> str:
        return write_file(
            path=path,
            content=content,
            workspace_dir=workspace_dir,
            project_id=project_id,
            api_base_url=api_base_url,
            collection_id=collection_id,
            collection_name=collection_name,
        )

    @tool(name="edit_file")
    def edit_file_bound(path: str, old_string: str, new_string: str) -> str:
        return edit_file(
            path=path,
            old_string=old_string,
            new_string=new_string,
            workspace_dir=workspace_dir,
        )

    @tool(name="glob")
    def glob_search_bound(pattern: str = "**/*", path: str = ".") -> str:
        return glob_search(pattern=pattern, path=path, workspace_dir=workspace_dir)

    @tool(name="grep")
    def grep_search_bound(pattern: str, path: str = ".") -> str:
        return grep_search(pattern=pattern, path=path, workspace_dir=workspace_dir)

    @tool(name="execute_command")
    def execute_command_bound(command: str, cwd: str = ".") -> str:
        return execute_command(command=command, cwd=cwd, workspace_dir=workspace_dir)

    @tool(name="generate_file")
    def generate_file_bound(path: str, python_code: str) -> str:
        return generate_file(
            path=path,
            python_code=python_code,
            workspace_dir=workspace_dir,
            project_id=project_id,
            api_base_url=api_base_url,
            collection_id=collection_id,
            collection_name=collection_name,
        )

    return [
      list_directory_bound,
      read_file_bound,
      write_file_bound,
      edit_file_bound,
      glob_search_bound,
      grep_search_bound,
      execute_command_bound,
      generate_file_bound,
    ]


def _filter_tools(tools: list, allowed_tool_names: set[str] | None) -> list:
    if not allowed_tool_names:
        return tools
    return [
        t for t in tools
        if (
            getattr(t, "tool_name", "")
            or getattr(t, "__name__", "")
            or getattr(t, "name", "")
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
    tools = create_file_tools(
        workspace_dir,
        project_id=project_id,
        api_base_url=api_base_url,
        collection_id=collection_id,
        collection_name=collection_name,
    )

    @tool(name="collection_overview")
    def collection_overview_bound(collection_id_override: str = "") -> str:
        return collection_overview(
            collection_id=collection_id_override or collection_id,
            project_id=project_id,
            api_base_url=api_base_url,
        )

    @tool(name="capture_artifact")
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

    @tool(name="collection_artifact_metadata")
    def collection_artifact_metadata_bound(collection_id_override: str = "") -> str:
        return collection_artifact_metadata(
            collection_id=collection_id_override or collection_id,
            project_id=project_id,
            api_base_url=api_base_url,
        )
    # Web, research, and project tools are added in Phase 1.3.3
    try:
        from .web_tools import web_fetch, web_search
        from .research_tools import deep_research, hf_daily_papers, hf_paper

        tools.extend([
            web_fetch,
            web_search,
            hf_daily_papers,
            hf_paper,
            deep_research,
            collection_overview_bound,
            collection_artifact_metadata_bound,
            capture_artifact_bound,
        ])
    except ImportError:
        pass

    return _filter_tools(tools, allowed_tool_names)
