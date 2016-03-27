'use strict';
var yeoman = require('yeoman-generator');
var yosay = require('yosay');
var chalk = require('chalk');
var path = require('path');
var fs = require('fs');
var uuid = require('uuid');
var spawn = require('child_process').spawn;
var spawnSync = require('child_process').spawnSync;
var request = require('request');
var xmldom = require("xmldom");
var wrench = require('wrench');
var _0777 = parseInt('0777', 8);

// Dependencies
var FsUnit = 'FsUnit ~> 1.3.1';
var NUnitRunners = 'NUnit.Runners ~> 2.6.4';
var FAKE = 'FAKE';

var FSharpGenerator = yeoman.generators.Base.extend({

    username: 'fsprojects',
    repo: 'generator-fsharp',
    branch: 'templates',

    ACTION_CREATE_STANDALONE_PROJECT: 1,
    ACTION_ADD_PROJECT_TO_SOLUTION: 2,
    ACTION_CREATE_EMPTY_SOLUTION: 3,

    constructor: function() {
        yeoman.generators.Base.apply(this, arguments);

        this.templatedata = {};

        var done = this.async();
        var p = path.join(this.cacheRoot(), "sha")
        var old = fs.existsSync(p);

        this._getSHA(old, p, done);
    },

    init: function() {
        this.log('Welcome to the ' + chalk.red('FSharp kata') + ' generator!');
    },

    askFor: function() {
        var done = this.async();
        var prompts = [{
            name: 'applicationName',
            message: 'What\'s the name of your kata?',
            default: this.type
        }];

        this.prompt(prompts, function(props) {
            this.action = 1;
            this.templatedata.namespace = props.applicationName;
            this.templatedata.applicationname = props.applicationName;
            this.templatedata.guid = uuid.v4();
            this.templatedata.packagesPath = "packages"
            this.templatedata.paketPath = ".paket"
            this.applicationName = props.applicationName;
            this.type = "classlib";
            this.paket = true;
            this.fake = true;
            done();
        }.bind(this));
    },

    writing: function() {
        this._copy_template();
        
        if(this.paket) {
            this._copy_paket();
        }
        
        if(this.fake) {
            this._copy_fake();
        }
    },

    install: function() {
        var log = this.log
        var done = this.async();
        var appName = this.applicationName;
        var action = this.action;
        var dest = this.destinationRoot();
        var fs = this.fs;
        var generator = this;

        this._make_build_sh_executable();

        var bpath = this._paket_bootstrap_path();

        var bootstrapper = this._execManaged(bpath, [], {});

        bootstrapper.stdout.on('data', function (data) {
            log(data.toString());
        });

        bootstrapper.on('close', function (code) {
            var paket_path;
            var dest_path;
           
            if(action !== this.ACTION_ADD_PROJECT_TO_SOLUTION) {
                paket_path = path.join(dest, appName, ".paket", "paket.exe" );
                dest_path = path.join(dest, appName);
            }
            else {
                paket_path = path.join(dest, ".paket", "paket.exe" );
                dest_path = dest;
            }

            try{
                log(dest_path);

                var paket = generator._execManaged(paket_path, ['convert-from-nuget','-f'], {cwd: dest_path});

                paket.stdout.on('data', function (data) {
                    log(data.toString());
                });

                paket.stdout.on('close', function (data) {
                    var simplifiy = generator._execManaged(paket_path, ['simplify'], {cwd: dest_path});

                    simplifiy.stdout.on('data', function (data) {
                        log(data.toString());
                    });

                    simplifiy.stdout.on('close', function (data) {
                        log("Adding FAKE dependency...");
                        var addFake = generator._execManaged(paket_path, ['add', 'nuget', FAKE], {cwd: dest_path});

                        addFake.stdout.on('close', function(data) {
                            log("Adding FsUnit dependency...");
                            var addFsUnit = generator._execManaged(paket_path, ['add', 'nuget', FsUnit], {cwd: dest_path});

                            addFsUnit.stdout.on('close', function(data) {
                                log("Adding Nunit.Runners dependency...");
                                var addNUnit_Runners = generator._execManaged(paket_path, ['add', 'nuget', NUnitRunners], {cwd: dest_path});
                                
                                addNUnit_Runners.stdout.on('close', function(data) {
                                    generator._addReferences();
                                    done();
                                })
                            })
                        })
                    });
                });
            }
            catch(ex)
            {
                log(ex);
            }
        });
    },

    end: function() {
        this.log('\r\n');
        this.log('Your project is now created');
        this.log('\r\n');
    },

    _copy_template: function() {
        var p;

        if (this.action === this.ACTION_CREATE_EMPTY_SOLUTION){
            p = path.join(this._getTemplateDirectory(), 'sln')
        }
        else {
            p = path.join(this._getTemplateDirectory(), this.type);
        }
        
        this._copy(p, this.applicationName);
    },
    
    _copy_paket: function() {
        var bpath = this._paket_bootstrap_path();

        var p = path.join(this._getTemplateDirectory(), ".paket", "paket.bootstrapper.exe");
        
        this.copy(p, bpath);
    },

    _copy_fake: function() {
        if (this.action !== this.ACTION_ADD_PROJECT_TO_SOLUTION) {
            var fakeSource = path.join(this._getTemplateDirectory(), ".fake");
            this._copy(fakeSource, this.applicationName);
        }
    },

    _make_build_sh_executable: function() {
        var dest = this.destinationRoot();

        if (!this._isOnWindows()) {
            var buildShPath = path.join(dest, this.applicationName, 'build.sh');
            var chmodProc = spawnSync('chmod', ['+x', buildShPath], {cwd: dest});
        }
    },

    _paket_bootstrap_path: function() {
        var bpath;
        
        if(this.action !== this.ACTION_ADD_PROJECT_TO_SOLUTION) {
            bpath = path.join(this.applicationName, ".paket", "paket.bootstrapper.exe" );
        }
        else {
            bpath = path.join(".paket", "paket.bootstrapper.exe" );
        }

        return bpath;
    },

    _copy: function(dirPath, targetDirPath){

        var files = fs.readdirSync(dirPath);
        for(var i in files)
        {
            var f = files[i];
            var fp = path.join(dirPath, f);
            this.log(f);
            if(fs.statSync(fp).isDirectory()) {
                 var newTargetPath = path.join(targetDirPath, f);
                 this._copy(fp, newTargetPath);
            }
            else {
                var fn = path.join(targetDirPath.replace('ApplicationName', this.applicationName), f.replace('ApplicationName', this.applicationName));
                this.template(fp,fn, this.templatedata);
            }
        }
    },

     _isOnWindows : function() {
        return /^win/.test(process.platform);
    },

    _download : function(t, done, reload) {
        t.remote(t.username, t.repo, t.branch, function (err,r) {
            done();
        }, reload)
    },

    _getTemplateDirectory : function() {
        return path.join(this.cacheRoot(), this.username, this.repo, this.branch);
    },

    _execManaged : function(file, args, options) {
        if(this._isOnWindows()){
            return spawn(file, args, options);
        }
        else {
            var monoArgs = [file];
            monoArgs = monoArgs.concat(args);
            return spawn('mono', monoArgs, options);
        }
    },

    _saveSHA : function (p, sha, old) {
        if (!fs.existsSync(p)){
            fs.mkdirParentSync(path.dirname(p));
        }

        if(old){
            fs.unlinkSync(p);
        }
        fs.appendFileSync(p, sha);
    },

    _checkSHA : function (t, p, sha, old, done) {
        var oldsha = "";
        if(old) oldsha = fs.readFileSync(p, 'utf8');
        if(old && sha != oldsha) {
            t._saveSHA(p, sha, true);
            t._download(t, done, true)
        }
        else if (old && sha == oldsha) {
            done();
        }
        else {
            t._saveSHA(p, sha, false);
            t._download(t, done, true);
        }
    },

    _getSHA : function(old, p, done) {
        var log = this.log;
        var t = this;
        var checkSHA = this._checkSHA;
        var options = {
            url: "https://api.github.com/repos/fsprojects/generator-fsharp/commits?sha=templates",
            headers: {
                'User-Agent': 'request'
            }
        };
        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var sha = JSON.parse(body)[0].sha;
                checkSHA(t, p, sha, old, done);
            }
        });
    },

    _addReferences: function(done) {
        var log = this.log;
        var projectFile = this._getProjectFile();
        var fs = this.fs;

        if (projectFile === undefined)
        {
            this.log("No project file in local folder found");
            return;
        }

        this.log("Project file: " + projectFile);

        var projectFileContent = fs.read(projectFile);

        var domParser = new xmldom.DOMParser();

        var projectXml = domParser.parseFromString(projectFileContent, 'text/xml');

        var projectReferenceItemGroup = this._references_item_group(projectXml);

        projectReferenceItemGroup.appendChild(this._addReference(projectXml, "FsUnit.NUnit", ".\\packages\\FsUnit\\Lib\\FsUnit.NUnit.dll"));
        projectReferenceItemGroup.appendChild(this._addReference(projectXml, "nunit.framework", ".\\packages\\NUnit\\lib\\nunit.framework.dll"));

        var xmlSerialzier = new xmldom.XMLSerializer()
        var xml = xmlSerialzier.serializeToString(projectXml);

        log("Please press Y for updating the existing file");

        //log(xml);
        fs.write(projectFile, xml);
    },

    _references_item_group: function(projectXml) {
        var projectReferenceItemGroup;
        
        var itemGroupNodes = projectXml.getElementsByTagName("ItemGroup");

        for (var c in itemGroupNodes)
        {
            var node = itemGroupNodes[c];

            for (var cc in node.childNodes)
            {
                var itemGroupNode = node.childNodes[cc];
                if (itemGroupNode.nodeName == "Reference")
                {
                    projectReferenceItemGroup = node;
                    break;
                }
            }
        }

        return projectReferenceItemGroup;
    },

    _addReference: function(projectXml, reference, hintPath) {
        var referenceNode = projectXml.createElement("Reference");
        referenceNode.setAttribute("Include", reference);

        var hintPathNode = projectXml.createElement("HintPath");
        hintPathNode.appendChild(projectXml.createTextNode(hintPath));

        var privateReference = projectXml.createElement("Private");
        privateReference.appendChild(projectXml.createTextNode("True"));

        referenceNode.appendChild(hintPathNode);
        referenceNode.appendChild(privateReference);

        return referenceNode;
    },

    _getProjectFile: function() {
        var dirPath = path.join(this.destinationRoot(),this.applicationName);
        var files = fs.readdirSync(dirPath);

        var projectFile;

        for(var i in files)
        {
            var f = files[i];
            var fp = path.join(dirPath, f);

            this.log(fp);

            if (fp.endsWith(".fsproj"))
            {
                projectFile = fp;
            }
        }

        return projectFile;
    },
});

//Helper functions
fs.mkdirParent = function(dirPath, mode, callback) {
  //Call the standard fs.mkdir
  fs.mkdir(dirPath, mode, function(error) {
    //When it fail in this way, do the custom steps
    if (error && error.errno === 34) {
      //Create all the parents recursively
      fs.mkdirParent(path.dirname(dirPath), mode, callback);
      //And then the directory
      fs.mkdirParent(dirPath, mode, callback);
    }
    //Manually run the callback since we used our own callback to do all these
    callback && callback(error);
  });
};

fs.mkdirParentSync = function sync (p, opts, made) {
    if (!opts || typeof opts !== 'object') {
        opts = { mode: opts };
    }

    var mode = opts.mode;
    var xfs = opts.fs || fs;

    if (mode === undefined) {
        mode = _0777 & (~process.umask());
    }
    if (!made) made = null;

    p = path.resolve(p);

    try {
        xfs.mkdirSync(p, mode);
        made = made || p;
    }
    catch (err0) {
        switch (err0.code) {
            case 'ENOENT' :
                made = sync(path.dirname(p), opts, made);
                sync(p, opts, made);
                break;

            // In the case of any other error, just see if there's a dir
            // there already.  If so, then hooray!  If not, then something
            // is borked.
            default:
                var stat;
                try {
                    stat = xfs.statSync(p);
                }
                catch (err1) {
                    throw err0;
                }
                if (!stat.isDirectory()) throw err0;
                break;
        }
    }

    return made;
};

module.exports = FSharpGenerator;