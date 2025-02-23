import * as semver from "semver";
import * as os from "os";
import * as fs from "fs-extra";
import * as path from "path";
import { Plugin, Manifest, AllUsersPlugins } from "../plugin";
import { Configuration } from "../config";
import { configFile, dataDir, pluginDir, pluginPerUserDir } from "../env";

let config: Configuration = {};
export const plugins: AllUsersPlugins = {};
const s = path.sep;

export function prepareConfigDir() {
    fs.ensureDirSync(dataDir);
    fs.ensureDirSync(pluginDir);
    fs.ensureDirSync(pluginPerUserDir);
    if (!fs.existsSync(configFile)) fs.writeJSONSync(configFile, {});
}

export function loadConfig() {
    config = fs.readJSONSync(configFile) || {};
}

function isPluginEnabled(manifest: Manifest) {
    if (config.plugins?.whitelist && !config.plugins.whitelist.includes(manifest.id)) {
        return false;
    }
    if (config.plugins?.blacklist && config.plugins.blacklist.includes(manifest.id)) {
        return false;
    }

    return true;
}

function isPluginRequirementsMet(manifest: Manifest) {
    if (manifest.requirements?.os) {
        let meetRequirements = false;
        const osRelease = os.release();
        for (const item of manifest.requirements.os) {
            if (item.platform != process.platform) continue;
            if (item.lte && !semver.lte(item.lte, osRelease)) continue;
            if (item.lt && !semver.lt(item.lt, osRelease)) continue;
            if (item.gte && !semver.gte(item.gte, osRelease)) continue;
            if (item.gt && !semver.gt(item.gt, osRelease)) continue;
            if (item.eq && !semver.eq(item.eq, osRelease)) continue;
            meetRequirements = true;
            break;
        }
        if (!meetRequirements) {
            return false;
        }
    }

    return true;
}

export function parsePlugin(dir: string) {
    const manifestFile = `${dir}${s}qqntim.json`;
    if (!fs.existsSync(manifestFile)) return null;
    const manifest = fs.readJSONSync(manifestFile) as Manifest;

    const meetRequirements = isPluginRequirementsMet(manifest),
        enabled = isPluginEnabled(manifest),
        loaded = meetRequirements && enabled;
    if (!meetRequirements)
        console.error(`[!Plugins] 跳过加载插件：${manifest.id}（当前环境不满足要求）`);
    else if (!enabled)
        console.error(`[!Plugins] 跳过加载插件：${manifest.id}（插件已被禁用）`);

    return {
        enabled: enabled,
        meetRequirements: meetRequirements,
        loaded: loaded,
        id: manifest.id,
        dir: dir,
        injections: manifest.injections.map((injection) => {
            return injection.type == "main"
                ? { ...injection }
                : {
                      ...injection,
                      pattern: injection.pattern && new RegExp(injection.pattern),
                  };
        }),
        manifest: manifest,
    } as Plugin;
}

function collectPluginsFromDir(baseDir: string, uin: string = "") {
    const folders = fs.readdirSync(baseDir);
    if (!plugins[uin]) plugins[uin] = {};
    folders.forEach((folder) => {
        const folderPath = `${baseDir}${s}${folder}`;
        if (fs.statSync(folderPath).isDirectory()) {
            const plugin = parsePlugin(folderPath);
            if (!plugin) return;
            if (plugins[uin][plugin.id]) return;
            plugins[uin][plugin.id] = plugin;
        }
    });
}

export function collectPlugins() {
    collectPluginsFromDir(pluginDir);
    const folders = fs.readdirSync(pluginPerUserDir);
    folders.forEach((folder) => {
        const folderPath = `${pluginPerUserDir}${s}${folder}`;
        if (fs.statSync(folderPath).isDirectory()) {
            collectPluginsFromDir(folderPath, folder);
        }
    });
}
