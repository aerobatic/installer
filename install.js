var fs = require('fs'),
  path = require('path'),
  spawn = require('child_process').spawn,
  chalk = require('chalk'),
  async = require('async');

var buildTool = null;

// Get all the args that start with npm_config_aerobatic
var installArgs = {};
for (key in process.env) {
  if (/^npm_config_aerobatic_/.test(key))
    installArgs[key.substr(21)] = process.env[key];
}

console.log(chalk.yellow("==> Installation args"));
console.log(installArgs);

// Validate all required installArgs are present
var requiredArgs = ['user', 'id', 'repo', 'key', 'dir'];
for (var i=0; i<requiredArgs.length; i++) {
  if (!installArgs[requiredArgs[i]]) {
    return console.error(chalk.bgRed("==> Install failed: Missing required arg '" + requiredArgs[i] + "'"));
  }
}

var appDir = path.join(installArgs.dir, installArgs.name);
var installSteps = [];

// Git clone
installSteps.push(gitCloneStep());

// NPM Install
installSteps.push({
  test: function() {
    return fs.existsSync(path.join(appDir, 'package.json'));
  },
  exec: makeShellStep({
    cmd: 'npm',
    args: ['install'],
    cwd: appDir
  })
});

// Bower install
installSteps.push({
  test: function() {
    return fs.existsSync(path.join(appDir, 'bower.json'));
  },
  exec: makeShellStep({
    cmd: 'bower',
    args: ['install'],
    cwd: appDir
  })
});

// Detect the build tool.
installSteps.push({
  exec: function(cb) {
    if (fs.existsSync(path.join(appDir, 'Gruntfile.js')) || fs.existsSync(path.join(appDir, 'Gruntfile.coffee')))
      buildTool = 'grunt';
    else if (fs.existsSync(path.join(appDir, 'gulpfile.js')))
      buildTool = 'gulp';
    else
      cb(new Error("Did not detect either a Gruntfile or gulpfile in the repo"));

    cb(null);
  }
});

// Write credentials to .aerobatic file
installSteps.push({
  exec: function(cb) {
    var json = {
      userId: installArgs.user,
      appId: installArgs.id,
      accessKey: installArgs.key,
      secretKey: installArgs.key
    };

    fs.writeFile(path.join(appDir, '.aerobatic'), JSON.stringify(json), cb);
  }
});

async.eachSeries(installSteps, function(step, cb) {
  if (!step.test || step.test())
    step.exec(cb);
  else
    cb(null);
}, function(err) {
  if (err)
    return console.error(chalk.bgRed("==> Install failed: " + err.message));

  console.log(chalk.bgGreen("==> Install of app " + installArgs.name + " succeeded!"));
  console.log(chalk.green("==> Now 'cd " + installArgs.name + "' and run '" + buildTool + " sim --open' to start the development server."));
});

function gitCloneStep() {
  var args = ['clone', installArgs.repo, '--depth', '1', appDir];
  if (installArgs.branch) {
    args.push('--branch');
    args.push(installArgs.branch);
  }

  return {
    exec: makeShellStep({
      cmd: 'git',
      args: args
    })
  };
}

function makeShellStep(command) {
  return function(cb) {
    if (!command.cwd)
      command.cwd = process.cwd();

    var childProcess = spawn(command.cmd, command.args, {
      cwd: command.cwd,
      stdio: 'inherit'
    });

    childProcess.on('error', function(err) {
      return cb(err);
    });

    childProcess.on('exit', function(code, signal) {
      if (code !== 0)
        return cb(new Error(code));

      console.log(command.cmd + " exited with code " + code);
      cb();
    });
  };
}
