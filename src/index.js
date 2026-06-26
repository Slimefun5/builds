$(function() {
    $.getJSON("/builds/resources/repos.json", repos => {
        $("#repos").html("");

        let plugins = groupByPlugin(repos);

        // Living plugins first (alphabetical), fully abandoned plugins to the bottom
        let keys = Object.keys(plugins).sort((a, b) => sortPlugins(plugins[a], plugins[b]));

        for (let key of keys) {
            console.log(`Found Plugin "${key}"`);
            addPlugin(plugins[key]);
        }
    });
});

// Collapses the flat "owner/repo:branch" map into one entry per plugin (owner/repo)
// with its branches nested, so each plugin is rendered exactly once.
function groupByPlugin(repos) {
    let plugins = {};

    for (let repo in repos) {
        let owner = repo.split("/")[0];
        let repository = repo.split("/")[1].split(":")[0];
        let branch = repo.split("/")[1].split(":")[1];
        let key = `${owner}/${repository}`;

        let directory = `${owner}/${repository}/${branch}`;
        if (repos[repo].options && repos[repo].options.custom_directory) {
            directory = repos[repo].options.custom_directory;
        }

        let abandoned = !!(repos[repo].options && repos[repo].options.abandoned);
        let prefix = (repos[repo].options && repos[repo].options.prefix) || "DEV";

        if (!plugins[key]) {
            plugins[key] = { owner: owner, repository: repository, branches: [] };
        }

        plugins[key].branches.push({ branch: branch, directory: directory, abandoned: abandoned, prefix: prefix });
    }

    for (let key in plugins) {
        plugins[key].branches.sort((a, b) => a.branch.toUpperCase() > b.branch.toUpperCase() ? 1 : -1);
    }

    return plugins;
}

function isAbandoned(plugin) {
    return plugin.branches.every(branch => branch.abandoned);
}

function sortPlugins(a, b) {
    if (isAbandoned(a) && !isAbandoned(b)) {
        return 1;
    } else if (!isAbandoned(a) && isAbandoned(b)) {
        return -1;
    } else {
        return a.repository.toUpperCase() > b.repository.toUpperCase() ? 1 : -1;
    }
}

function addPlugin(plugin) {
    let cardId = `plugin_${plugin.owner}_${plugin.repository}`.replace(/[^a-zA-Z0-9_]/g, "_");

    $("#repos").append(
        `<div class="box box_plugin ${isAbandoned(plugin) ? "abandoned" : "alive"}">
            <a class="link_repo" href="https://github.com/${plugin.owner}/${plugin.repository}">
                <img alt="repository" src="https://cdnjs.cloudflare.com/ajax/libs/octicons/8.5.0/svg/repo.svg" class="plugin_icon">
                <span>${plugin.repository}</span>
            </a>
            <table id="${cardId}" class="info_table"></table>
        </div>`
    );

    let table = $("#" + cardId);

    for (let branch of plugin.branches) {
        addBranchRow(table, plugin, branch);
    }
}

function addBranchRow(table, plugin, branch) {
    let rowId = branch.directory.replace(/[^a-zA-Z0-9_]/g, "_");

    table.append(
        `<tr class="branch_row ${branch.abandoned ? "abandoned" : "alive"}" project="${plugin.repository}:${branch.branch}">
            <td class="icon">
                <img alt="branch" src="https://cdnjs.cloudflare.com/ajax/libs/octicons/8.5.0/svg/git-branch.svg" />
            </td>
            <td class="branch_label">
                <a class="link_info" href="${branch.directory}">${branch.branch}${branch.abandoned ? " [abandoned]" : ""}</a>
                <span class="prefix_tag">${branch.prefix}</span>
            </td>
            <td class="branch_download" id="dl_${rowId}">
                <span class="download_pending">…</span>
            </td>
            <td>
                <img class="badge" alt="build badge" src="/builds/${branch.directory}/badge.svg" />
            </td>
        </tr>`
    );

    // Resolve the latest jar from this branch's own builds.json (the per-project state file)
    $.getJSON(`/builds/${branch.directory}/builds.json`, builds => {
        let id = builds.last_successful || builds.latest;
        let cell = $("#dl_" + rowId);

        if (id && builds[id]) {
            let label = (builds[id].candidate === "RELEASE" && builds[id].tag) ? builds[id].tag : `#${id}`;
            // Release builds link directly to the published asset; compiled builds to the hosted jar
            let href = builds[id].jarUrl || `${branch.directory}/${plugin.repository}-${id}.jar`;
            cell.html(
                `<a class="download_link" href="${href}" download>
                    <img class="dl_icon" alt="download" src="https://cdnjs.cloudflare.com/ajax/libs/octicons/8.5.0/svg/desktop-download.svg" />
                    <span>Latest jar (${label})</span>
                </a>`
            );
        } else {
            cell.html(`<span class="download_none">no build yet</span>`);
        }
    }).fail(() => {
        $("#dl_" + rowId).html(`<span class="download_none">no build yet</span>`);
    });
}
