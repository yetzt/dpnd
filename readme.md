# dpnd

**dpnd** automagically fills your [package.json](http://package.json.nodejitsu.com/) with dependencies. 
if there is no package.json, one with reasonable defaults will be created. 

dpnd searches for all non-builtin modules you `require()` and determines the version you are using by traversing through your filesystem [the same way nodejs does](http://nodejs.org/api/modules.html#modules_loading_from_node_modules_folders).

## Install

````
npm install -g dpnd
````

## Usage

````
dpnd [file|folder]
````
