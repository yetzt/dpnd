#!/usr/bin/env node

/* get node modules */
var fs = require("fs");
var path = require("path");

/* get npm modules */
var program = require("commander");
var linereader = require("line-reader");
var walk = require("walk");
var _ = require("underscore");

/* all builtin node modules to ignore */
var BUILTIN_MODULES = ["assert","buffer","child_process","cluster","crypto","dgram","dns","domain","events","fs","http","https","net","os","path","punycode","readline","repl","stream","string_decoder","tls","url","util","vm","zlib"];

/* configure command line */
program
	.version('0.0.1')
	.parse(process.argv);

var parse_file = function(filename, callback) {
	
	var modules = [];
	fs.exists(filename, function(exists){
		if (!exists) return callback(new Error("file does not exists: "+filename));
		linereader.eachLine(filename, function(line, last){
			var list = line.match(/require\([\'\"]([a-z0-9\-]+)[\'\"]\)/gi);
			if (list !== null) list.forEach(function(match){
				var modname = match.replace(/^.*require\([\'\"]([a-z0-9\-]+)[\'\"]\).*$/gi, '$1');
				if (BUILTIN_MODULES.indexOf(modname) < 0) {
					modules.push(modname);
				}
			});
			if (last) return callback(null, modules);
		});
		
	});
};

var module_dirs = function(dir, callback, collection) {
	/* initialize collection */
	if (typeof collection === "undefined") var collection = [];
	/* check if node_modules dir is present */
	var modules_dir = path.resolve(dir, "node_modules");
	fs.exists(modules_dir, function(exists){
		if (exists) collection.push(modules_dir);
		/* check for root dir */
		if (dir !== "/") {
			return module_dirs(path.dirname(dir), callback, collection)
		} else {
			callback(collection);
		}
	});
};

var module_version = function(module, dirs, callback) {
	var chk = dirs.length;
	dirs.every(function(dir){
		var package_json_file = path.resolve(dir, module, "package.json");
		if (fs.existsSync(package_json_file)) {
			fs.readFile(package_json_file, function(err, data){
				if (err) return callback(err);
				package_json = JSON.parse(data);
				if (!("version" in package_json)) return callback(new Error("No 'version' object in package.json"));
				callback(null, package_json.version);
			});
			return false;
		} else {
			if (-- chk === 0) return callback(new Error("No 'version' object in package.json"));
			return true;
		}
	});
};

var determine_modules = function(files, dir, callback) {
	
	var modules = [];
	
	var walker = function(walker_callback) {
		parse_file(files.shift(), function(err, _modules){
			if (err) return console.error(err);
			modules = modules.concat(_modules);
			if (files.length > 0) return walker(walker_callback);
			walker_callback();
		});
	};
	
	walker(function(){
		modules = _.uniq(modules);

		module_dirs(dir, function(moddirs){
		
			var package_versions = {};
		
			var versioner = function(versioner_callback) {
				if (modules.length === 0) return versioner_callback();
				var mod = modules.shift();
				module_version(mod, moddirs, function(err, version){
					if (err) console.error("could not determine version for module:", mod);
					if (!err) package_versions[mod] = version;
					if (modules.length > 0) return versioner(versioner_callback);
					versioner_callback();
				});
			}
			
			versioner(function(){
				callback(package_versions);
			});
			
		});
		
	});
	
}

var determine_input = function(callback) {
	
	/* guess directory */
	if (program.args.length >= 1) {
		var check_path = path.resolve(program.args[0]);
	} else {
		var check_path = process.cwd();
	}
	
	/* check if path exists */
	if (!fs.existsSync(check_path)) {
		console.error("given path does not exists:", check_path);
		process.exit();
	}
	
	/* determine if direcory or single file */
	var stats = fs.statSync(check_path);
	
	if (stats.isDirectory()) {
		
		/* find all .js files */
		var files = [];
		var package_json = path.resolve(check_path, "package.json");

		walk.walk(check_path, {
			followLinks: false,
			filters: ["node_modules", ".git"]
		}).on("file", function(root, fileStats, next){
			if (fileStats.name.match(/\.js$/)) {
				files.push(path.resolve(root, fileStats.name));
			}
			next();
		}).on("end", function(){
			callback(files, package_json, check_path);
		});
		
	} else if (stats.isFile()) {
		
		/* call back with file in list and package.json in same dir */
		callback([check_path], path.resolve(path.dirname(check_path), "package.json"), path.dirname(check_path));
		
	} else {
		console.error("given path is neither file nor directory:", check_path);
		process.exit();
	}
	
	
}

var make_package = function(package_json_file, modules, callback) {
	
	if (fs.existsSync(package_json_file)) {

		/* add new modules to package.json */
		
		var package_json = JSON.parse(fs.readFileSync(package_json_file));
		for (name in modules) if (!(name in package_json.dependencies)) package_json.dependencies[name] = ">= "+modules[name];
		fs.writeFile(package_json_file, JSON.stringify(package_json,null,'\t'), callback);
		
	} else {
		
		/* create new package.json with reasonable defaults */
		
		var package_name = path.basename(path.dirname(package_json_file))
			.replace(/[^a-z0-9]/g,'-')
			.replace(/^node-/,'')
			.replace(/-js$/,'');
		
		var package_json = {
			"private": true,
			"name": package_name,
			"version": "0.0.1",
			"description": "auto-generated by dpnd",
			"dependencies": {},
			"engines": {
				"node": process.versions.node
			}
		};
		
		for (name in modules) package_json.dependencies[name] = ">= "+modules[name];

		fs.writeFile(package_json_file, JSON.stringify(package_json,null,'\t'), callback);
		
	}
	
}

determine_input(function(files, pckg, dir){
	
	determine_modules(files, dir, function(modules){
		
		make_package(pckg, modules, function(){
			
			console.log("your package.json was updated <3");
			
		});

	});
	
});

