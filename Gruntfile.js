
module.exports = function (grunt) {
    
    grunt.initConfig({
        pkg: grunt.file.readJSON("package.json"),
        
        requirejs: {
            demo: {
                options: {
                    almond: true,
                    optimize: "none",
                    baseUrl: "demo",
                    paths: {
                        Autobus: "../js/Autobus"
                    },
                    include: ["Autobus-demo"],
                    out: "dist/demo/Autobus-demo.js"
                }
            }
        },
        
        copy: {
            all: {
                files: [
                    {src: ["demo/*.html", "demo/*.css"], dest: "dist/"},
                ]
            }
        }
    });
    
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-requirejs");
    
    grunt.registerTask("default", ["requirejs", "copy"]);
};
