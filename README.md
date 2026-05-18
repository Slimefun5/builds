# Slimefun5 Builds Server
This is the repository of the backend for the Slimefun5 builds page.
The page can be found here: https://slimefun5.github.io/builds/

This serves as a Continuous Integration/Deployment service for Slimefun5 projects using static GitHub Pages.
It supports both Maven and Gradle projects.

## How it works
The code itself is a node.js program that runs on a schedule via GitHub Actions.
It reads repositories from `resources/repos.json` ([How to add your own repository](#how-to-add-your-own-repository)) and connects to the GitHub API.

### 1. Commits
The first step is to retrieve the latest commit from [GitHub's API](https://developer.github.com/v3/repos/commits/).
It will compare that commit's timestamp to the locally stored repository.
If the remote version is newer or if there isn't even a local version, we calculate the new build id.

### 2. Cloning
After we established that our repository is out of date, the program will `git clone` said repository.
It will also locate its build file (`pom.xml` or `build.gradle.kts`) and set the version to `"DEV - $id (git $commit)"`.

### 3. Compiling
The program runs `mvn clean package -B` (Maven) or `./gradlew build --no-daemon -x test` (Gradle) to compile the project.
It will also catch the state (Success / Failure).

### 4. Gathering Resources
The program will fetch the project's license and tags from GitHub.
It will also relocate the compiled jar to the main project directory.

### 5. Preparing the upload
Now the program will update the local `builds.json` file for the project.
It will add the newly compiled build, set the latest and last successful version,
and tag any builds that match up with the previously fetched tags.
Then it will generate a fresh `index.html` page for the project (from `resources/template.html`)
and a status badge (`resources/badge.svg`).

### 6. Finishing / Uploading
The program will add, commit and push all changed files to this repository.
After it's done, it will clear out any source files that arose during `git clone`.

## How to add your own repository
This repository hosts several Slimefun5 projects, including [Slimefun5](https://github.com/Slimefun5/Slimefun5) and a number of [Slimefun Addons](https://github.com/Slimefun5).
If you want your own project to be added, simply submit a Pull Request to this repository with your desired changes and a description of why you want your project to be added.
All you have to do is to modify the `resources/repos.json` file and add your repository as another JSON object.

### Guidelines
Repositories on this page must adhere to the following guidelines.
If a project violates any of these rules, it will be removed from the site.

1. They must be publicly available on GitHub and Open-Source.
2. They must have a valid `LICENSE` file with a permissive Open-Source license (e.g. MIT, Apache or GNU GPL or similar).
3. They must have a valid `pom.xml` or `build.gradle.kts` file.
4. They are not allowed to force auto-updates on people without providing an option to disable it.

### Example
```json
{
    "User/Repo:branch": {
        "options": {
            "prefix": "DEV"
        }
    }
}
```

### Options
| Option | Type | Description |
|--------|------|-------------|
| `prefix` | `string` | Build name prefix (e.g. `"DEV"`, `"STABLE"`, `"EXP"`) |
| `createJar` | `boolean` | Set to `false` to compile without producing a downloadable jar |
| `custom_directory` | `string` | Override the default output directory |
| `ignoreTags` | `boolean` | Set to `true` to skip tagging builds with GitHub release tags |
