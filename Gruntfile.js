
module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),

        minifiedName: "xml3d-webvr-plugin-min.js",

        browserify: {
            debug: {
                src: "src/webvr-plugin.js",
                dest: "xml3d-webvr-plugin.js",
                options: {
                    browserifyOptions: {
                        debug: true
                    }
                }
            },
            release: {
                src: "src/webvr-plugin.js",
                dest: "xml3d-webvr-plugin.js",
                options: {
                    browserifyOptions: {
                    }
                }
            },
            minified: {
                src: "src/webvr-plugin.js",
                dest: "<%= minifiedName %>",
                options: {
                    browserifyOptions: {
                        transform:  [['uglifyify', { global: true } ]]
                    }
                }
            }
        },

        concat: {
            options: {
                banner: '/*! xml3d-webvr-plugin.js v<%= pkg.version %> | (c) 2013-<%= grunt.template.today("yyyy") %> DFKI GmbH and contributors, www.dfki.de | https://raw.githubusercontent.com/xml3d/xml3d.js/master/LICENSE */'
            },
            dist: {
                src: ['<%= minifiedName %>'],
                dest: '<%= minifiedName %>'
            }
        }

    });

    grunt.loadNpmTasks("grunt-contrib-concat");
    grunt.loadNpmTasks("grunt-browserify");

    grunt.registerTask("build", ["browserify:release", "browserify:minified", "concat:dist"]);
    grunt.registerTask("dev", ["browserify:debug"]);
    grunt.registerTask("default", ["dev"]);
};
