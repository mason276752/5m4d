file=""
while [[ $# -gt 0 ]]
do
    key="$1"
    case $key in
        -f)
            file=$2
            shift
        ;;
        *)
            if [[ -z $file ]]
            then
                file=$key
            fi
        ;;
    esac
    shift
done

if [[ $file != "" ]]
then
    rm docker-compose.yaml 2> /dev/null
    docker rm -f ` docker ps -aq ` #danger
    docker images |egrep "dev\-" |awk '{print $3}' |xargs docker rmi -f
    cp $file docker-compose.yaml
    docker-compose up
else
    echo "please setting file.yaml"
fi