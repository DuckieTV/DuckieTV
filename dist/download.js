function download(data, fileName) {
    fileName = fileName.split("/").join("-");
    alert("Writing " + fileName + " to " + cordova.file.externalRootDirectory + "DuckieTV");
    window.resolveLocalFileSystemURL(cordova.file.externalRootDirectory, function(rootDir) {

        // create DuckieTV root dir on SDcard

        rootDir.getDirectory('DuckieTV', {
            create: false
        }, createBackup, function() {
            rootDir.getDirectory('DuckieTV', {
                create: true
            }, createBackup, function(e) {
                console.error("Could not create duckietv dir", e);
            });
        });

        function createBackup(baseDir) {
            // create backup file
            baseDir.getFile(fileName, {
                create: true,
                exclusive: false
            }, function(backupFile) {
                // create backup FileWriter
                backupFile.createWriter(function(backupFileWriter) {
                    // alert when done
                    backupFileWriter.onwriteend = function() {
                        alert("Backup saved to /sdcard/DuckieTV/" + fileName);
                    };
                    // alert when something fails
                    backupFileWriter.onerror = function(e) {
                        alert("Failed file write: " + e.toString());
                    };
                    // write the data to the file
                    backupFileWriter.write(new Blob([data], {
                        type: 'application/json'
                    }));
                });
            }, function(e) {
                alert("Error writing backupfile: " + JSON.stringify(e));
                console.error("Error writing backupfile: ", e);

            });

        }
    });
}