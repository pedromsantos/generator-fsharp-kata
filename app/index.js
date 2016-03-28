
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
    ACTION_CREATE_STANDALONE_PROJECT: 1,
    ACTION_ADD_PROJECT_TO_SOLUTION: 2,
    ACTION_CREATE_EMPTY_SOLUTION: 3,

    constructor: function() {
        yeoman.generators.Base.apply(this, arguments);
        this.templatedata = {};
        var done = this.async();    
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
            p = path.join(this.templatePath(), 'sln')
        }
        else {
            p = path.join(this.templatePath(), this.type);
        }
        
        this._copy(p, this.applicationName);
    },
    
    _copy_paket: function() {
        var bpath = this._paket_bootstrap_path();

        var p = path.join(this.templatePath(), ".paket", "paket.bootstrapper.exe");
        
        this.copy(p, bpath);
    },

    _copy_fake: function() {
        if (this.action !== this.ACTION_ADD_PROJECT_TO_SOLUTION) {
            var fakeSource = path.join(this.templatePath(), ".fake");
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

    _isOnWindows : function() {
        return /^win/.test(process.platform);
    },
});

module.exports = FSharpGenerator;